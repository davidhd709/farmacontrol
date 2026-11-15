import { prisma, Prisma } from '@farmacia/database';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JournalService } from '../../src/modules/accounting/application/journal.service';
import { isRetryableTransactionError } from '../../src/common/idempotency/idempotency.service';

/**
 * La anulación de un asiento compite con otras escrituras serializables (por ejemplo, la
 * incorporación del efectivo de una apertura). Bajo carga puede fallar por serialización, por
 * interbloqueo o porque la transacción interactiva expiró: debe repetirse como las demás
 * operaciones y terminar en su respuesta de negocio, no en un error interno.
 */
const known = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('fallo transitorio', {
    code,
    clientVersion: 'test',
    meta,
  });

/** Así llega un conflicto de serialización detectado en el COMMIT con @prisma/adapter-pg. */
function driverWriteConflict() {
  const error = new Error('TransactionWriteConflict');
  error.name = 'DriverAdapterError';
  return Object.assign(error, { cause: { kind: 'TransactionWriteConflict' } });
}

const input = {
  entryId: '11111111-1111-4111-8111-111111111111',
  entryDate: '2026-11-15',
  reason: 'Anulación de prueba',
  createdById: '22222222-2222-4222-8222-222222222222',
};

afterEach(() => vi.restoreAllMocks());

describe('isRetryableTransactionError', () => {
  it.each([
    ['conflicto de serialización (P2034)', known('P2034')],
    ['transacción expirada (P2028)', known('P2028')],
    ['40001 por SQL directo (P2010)', known('P2010', { code: '40001' })],
    ['interbloqueo por SQL directo (P2010)', known('P2010', { code: '40P01' })],
    ['mensaje de PostgreSQL', new Error('could not serialize access due to concurrent update')],
    ['conflicto al confirmar (adaptador de PostgreSQL)', driverWriteConflict()],
  ])('reintenta %s', (_name, error) => {
    expect(isRetryableTransactionError(error)).toBe(true);
  });

  it.each([
    ['clave única (P2002)', known('P2002')],
    ['otro SQL directo (P2010)', known('P2010', { code: '23505' })],
    ['error de negocio', new Error('Asiento publicado inexistente.')],
  ])('no reintenta %s', (_name, error) => {
    expect(isRetryableTransactionError(error)).toBe(false);
  });
});

describe('JournalService.reverse ante fallos transitorios', () => {
  it.each([
    ['transacción expirada', known('P2028')],
    ['40001 por SQL directo', known('P2010', { code: '40001' })],
    ['interbloqueo', new Error('deadlock detected')],
    ['conflicto al confirmar', driverWriteConflict()],
  ])('repite la transacción tras %s y devuelve la reversa', async (_name, error) => {
    const reversal = { id: 'reversa', lines: [] };
    const transaction = vi
      .spyOn(prisma, '$transaction')
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(reversal as never);
    vi.spyOn(prisma.journalEntry, 'findUnique').mockResolvedValue(null);

    await expect(new JournalService().reverse(input)).resolves.toBe(reversal);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('si otra transacción ya reversó el asiento con los mismos datos, devuelve esa reversa', async () => {
    const existing = {
      id: 'reversa-previa',
      status: 'POSTED',
      reversalOfId: input.entryId,
      entryDate: new Date(`${input.entryDate}T00:00:00.000Z`),
      reversalReason: input.reason,
      createdById: input.createdById,
      lines: [],
    };
    const transaction = vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(known('P2028'));
    vi.spyOn(prisma.journalEntry, 'findUnique').mockResolvedValue(existing as never);

    await expect(new JournalService().reverse(input)).resolves.toBe(existing);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('no reintenta un error que no es transitorio', async () => {
    const transaction = vi
      .spyOn(prisma, '$transaction')
      .mockRejectedValueOnce(new Error('Asiento publicado inexistente.'));

    await expect(new JournalService().reverse(input)).rejects.toThrow(
      'Asiento publicado inexistente.',
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('se rinde tras diez intentos y propaga el último fallo', async () => {
    vi.useFakeTimers();
    try {
      const transaction = vi.spyOn(prisma, '$transaction').mockRejectedValue(known('P2034'));
      vi.spyOn(prisma.journalEntry, 'findUnique').mockResolvedValue(null);

      const pending = new JournalService().reverse(input).catch((e: unknown) => e);
      await vi.runAllTimersAsync();
      const result = await pending;
      expect(result).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect(transaction).toHaveBeenCalledTimes(10);
    } finally {
      vi.useRealTimers();
    }
  });
});
