import { describe, expect, it, vi } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import { DomainError } from '../../src/common/domain-error';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { toHundredths } from '../../src/modules/sales/domain/sale-money';
import {
  SaleNotFoundException,
  InsufficientStockException,
  SaleAlreadyCancelledException,
} from '../../src/modules/sales/domain/sale.exceptions';
import { PurchaseLine } from '../../src/modules/purchases/domain/purchase.entity';
import {
  PurchaseNotFoundException,
  DuplicatePurchaseInvoiceException,
} from '../../src/modules/purchases/domain/purchase.exceptions';
import { InventoryLot } from '../../src/modules/inventory/domain/entities/inventory-lot.entity';
import { InventoryLotService } from '../../src/modules/inventory/application/services/inventory-lot.service';
import { InsufficientInventoryException } from '../../src/modules/inventory/domain/exceptions/inventory.exceptions';
import {
  parseMoneyToCents,
  calculateNewBalanceCents,
  TreasuryNotFoundError,
} from '../../src/modules/treasury/domain/treasury-rules';
import {
  validateAccountNature,
  validateParent,
  AccountingConflictError,
} from '../../src/modules/accounting/domain/accounting-rules';
import { SaleController } from '../../src/modules/sales/presentation/controllers/sale.controller';
import type { SaleService } from '../../src/modules/sales/application/sale.service';
import type { ConfirmSaleDto } from '../../src/modules/sales/presentation/dtos/confirm-sale.dto';
import type { AuthenticatedUserContext } from '../../src/modules/identity/presentation/guards/session-auth.guard';
import type { Request } from 'express';
import { IdempotencyService } from '../../src/common/idempotency/idempotency.service';
import type { Prisma } from '@farmacia/database';

function responseFor(error: unknown) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  new HttpExceptionFilter().catch(error, {
    switchToHttp: () => ({
      getRequest: () => ({ headers: {}, correlationId: 'domain-test' }),
      getResponse: () => ({ status, setHeader: vi.fn() }),
    }),
  } as unknown as ArgumentsHost);
  return { status: status.mock.calls[0][0], body: json.mock.calls[0][0] };
}

const invalidLot = () =>
  InventoryLot.create({
    productId: '',
    locationId: 'location',
    controlMode: 'LOT_EXPIRY',
    lotNumber: 'LOT',
    expirationDate: '2099-01-01',
  });
const missingLot = () =>
  new InventoryLotService(
    { findById: vi.fn().mockResolvedValue(null) } as never,
    {} as never,
    {} as never,
  ).getLotById('missing');

describe('Errores representativos por módulo a través del filtro HTTP', () => {
  it.each<[string, number, () => unknown]>([
    ['ventas: validation', 400, () => toHundredths(Number.NaN, 'Precio')],
    [
      'ventas: not_found',
      404,
      () => {
        throw new SaleNotFoundException('missing');
      },
    ],
    [
      'ventas: conflict',
      409,
      () => {
        throw new InsufficientStockException('Producto', 2, 0);
      },
    ],
    [
      'compras: validation',
      400,
      () =>
        PurchaseLine.create({
          productId: '',
          lotNumber: 'LOT',
          expirationDate: new Date('2099-01-01'),
          quantityCommercial: 1,
          conversionFactor: 1,
          unitCost: 1,
        }),
    ],
    [
      'compras: not_found',
      404,
      () => {
        throw new PurchaseNotFoundException('missing');
      },
    ],
    [
      'compras: conflict',
      409,
      () => {
        throw new DuplicatePurchaseInvoiceException('FAC');
      },
    ],
    ['inventario: validation', 400, invalidLot],
    ['inventario: not_found', 404, missingLot],
    [
      'inventario: conflict',
      409,
      () => {
        throw new InsufficientInventoryException();
      },
    ],
    ['tesorería: validation', 400, () => parseMoneyToCents('inválido', 'Importe')],
    [
      'tesorería: not_found',
      404,
      () => {
        throw new TreasuryNotFoundError('Cuenta bancaria no encontrada.');
      },
    ],
    ['tesorería: conflict', 409, () => calculateNewBalanceCents(0n, 'WITHDRAWAL', 1n)],
    ['contabilidad: validation', 400, () => validateAccountNature('INVALID')],
    [
      'contabilidad: not_found',
      404,
      () => validateParent({ code: '1', type: 'ASSET' }, null, 'missing'),
    ],
    [
      'contabilidad: conflict',
      409,
      () => {
        throw new AccountingConflictError('Período cerrado.');
      },
    ],
  ])('%s → %i', async (_, expectedStatus, operation) => {
    let error: unknown;
    try {
      await operation();
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    const response = responseFor(error);
    expect(response.status).toBe(expectedStatus);
    expect(response.body.message).toBe((error as Error).message);
  });
});

describe('Ventas: delegación al filtro y compatibilidad de excepciones explícitas', () => {
  it.each([
    [new DomainError('Cliente no existe.', 'not_found'), 404],
    [new DomainError('Estado incompatible.', 'conflict'), 409],
    [new Error('Fallo interno'), 500],
    [new InsufficientStockException('Producto', 2, 1), 400],
  ] as const)('confirmar conserva el código esperado: %s → %i', async (error, status) => {
    const controller = new SaleController({
      confirmSale: vi.fn().mockRejectedValue(error),
    } as unknown as SaleService);
    const thrown = await controller
      .confirmSale(
        {} as ConfirmSaleDto,
        'key',
        { id: 'user', permissions: [] } as unknown as AuthenticatedUserContext,
        { headers: {} } as Request,
      )
      .catch((caught: unknown) => caught);
    expect(responseFor(thrown).status).toBe(status);
  });

  it('anular mantiene el 400 existente de SaleAlreadyCancelledException', async () => {
    const controller = new SaleController({
      cancelSale: vi.fn().mockRejectedValue(new SaleAlreadyCancelledException('FAC')),
    } as unknown as SaleService);
    const thrown = await controller
      .cancel(
        'id',
        { reason: 'Motivo' },
        { id: 'user' } as AuthenticatedUserContext,
        { headers: {} } as Request,
      )
      .catch((caught: unknown) => caught);
    expect(responseFor(thrown).status).toBe(400);
  });

  it('idempotencia en modo http lanza DomainError y conserva 409 y mensaje', async () => {
    const tx = {
      $queryRaw: vi.fn(),
      idempotencyKey: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ expiresAt: new Date('2099-01-01'), requestHash: 'other' }),
      },
    } as unknown as Prisma.TransactionClient;
    const error = await new IdempotencyService()
      .getRecord('key', 'hash', tx, 'http')
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DomainError);
    expect(responseFor(error)).toMatchObject({
      status: 409,
      body: { message: 'Idempotency-Key ya se utilizó con una solicitud diferente.' },
    });
  });
});
