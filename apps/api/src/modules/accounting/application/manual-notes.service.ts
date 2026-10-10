import { Injectable } from '@nestjs/common';
import { prisma, Prisma } from '@farmacia/database';
import type { CreateManualNotePayload, ManualNoteCreatedDto } from '@farmacia/contracts';
import { JournalService } from './journal.service';
import { AccountingConflictError, AccountingValidationError } from '../domain/accounting-rules';
import { IdempotencyService } from '../../sales/infrastructure/idempotency.service';

export const MANUAL_NOTE_SOURCE = 'MANUAL_NOTE';
const ENDPOINT = '/api/v1/accounting/manual-notes';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRetryable(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2002' || error.code === 'P2034')
  );
}

/**
 * Nota contable manual (acuerdo del 4 de octubre): asiento libre con la fecha que elija la
 * contadora, para ajustes, traslados y el registro de operaciones de meses anteriores. El
 * balance, las cuentas imputables, el período cerrado y el bloqueo de documentos los valida
 * JournalService como en cualquier otro asiento.
 */
@Injectable()
export class ManualNotesService {
  constructor(
    private readonly journalService: JournalService,
    private readonly idempotencyService: IdempotencyService = new IdempotencyService(),
  ) {}

  async create(
    payload: CreateManualNotePayload,
    userId: string,
    idempotencyKey: string | undefined,
  ): Promise<ManualNoteCreatedDto> {
    const key = idempotencyKey?.trim();
    if (!key || key.length > 100) {
      throw new AccountingValidationError('Idempotency-Key es obligatorio (máximo 100 caracteres).');
    }
    const input = this.validate(payload);
    const requestHash = this.idempotencyService.computeHash(ENDPOINT, userId, input);

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await prisma.$transaction(
          async (tx) => {
            const cached = await this.idempotencyService.getRecord(key, requestHash, tx);
            if (cached) return cached.responseBody as ManualNoteCreatedDto;

            // Consecutivo sin saltos: count + 1 en transacción serializable; la UNIQUE
            // (source_type, source_id) rechaza la colisión y se reintenta.
            const count = await tx.journalEntry.count({ where: { sourceType: MANUAL_NOTE_SOURCE } });
            const noteNumber = `NTC-${String(count + 1).padStart(6, '0')}`;

            const entry = await this.journalService.post(
              {
                entryDate: input.entryDate,
                description: `${noteNumber} ${input.description}`,
                sourceType: MANUAL_NOTE_SOURCE,
                sourceId: noteNumber,
                createdById: userId,
                lines: input.lines,
              },
              tx,
            );
            const result: ManualNoteCreatedDto = { journalEntryId: entry.id, noteNumber };
            await this.idempotencyService.saveRecord(
              { key, userId, endpoint: ENDPOINT, requestHash, responseStatus: 201, responseBody: result },
              tx,
            );
            await tx.auditEvent.create({
              data: {
                userId,
                action: 'accounting:manual_note_created',
                entity: 'JournalEntry',
                entityId: entry.id,
                details: { noteNumber, entryDate: input.entryDate },
              },
            });
            return result;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (isRetryable(error) && attempt < 4) continue;
        throw error;
      }
    }
    throw new AccountingConflictError('No se pudo registrar la nota contable.');
  }

  private validate(payload: CreateManualNotePayload): CreateManualNotePayload {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new AccountingValidationError('Datos de la nota contable inválidos.');
    }
    if (typeof payload.description !== 'string' || !payload.description.trim()) {
      throw new AccountingValidationError('La descripción de la nota es obligatoria.');
    }
    if (payload.description.trim().length > 480) {
      throw new AccountingValidationError('La descripción no puede superar 480 caracteres.');
    }
    if (!Array.isArray(payload.lines) || payload.lines.length < 2 || payload.lines.length > 200) {
      throw new AccountingValidationError('La nota requiere entre 2 y 200 líneas.');
    }
    const lines = payload.lines.map((line, index) => {
      if (!line || typeof line !== 'object' || typeof line.accountId !== 'string' || !UUID_RE.test(line.accountId)) {
        throw new AccountingValidationError(`La línea ${index + 1} requiere una cuenta válida.`);
      }
      if (typeof line.debit !== 'string' || typeof line.credit !== 'string') {
        throw new AccountingValidationError(
          `La línea ${index + 1} debe indicar débito y crédito como texto decimal.`,
        );
      }
      return {
        accountId: line.accountId,
        debit: line.debit.trim() || '0',
        credit: line.credit.trim() || '0',
        ...(typeof line.description === 'string' && line.description.trim()
          ? { description: line.description.trim() }
          : {}),
      };
    });
    return { entryDate: payload.entryDate, description: payload.description.trim(), lines };
  }
}
