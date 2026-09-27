import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CashService } from '../../src/modules/cash/application/cash.service';
import { ICashMovementRepository } from '../../src/modules/cash/domain/cash-movement.repository';
import { CashMovement } from '../../src/modules/cash/domain/cash-movement.entity';
import {
  InvalidCashAmountException,
  InvalidCashMovementTypeException,
  InsufficientCashBalanceException,
} from '../../src/modules/cash/domain/cash.exceptions';
import { BadRequestException } from '@nestjs/common';

describe('CashService & Cash Entities (Unit)', () => {
  let repository: ICashMovementRepository;
  let mockAuditService: any;
  let service: CashService;

  beforeEach(() => {
    repository = {
      saveTransactional: vi.fn(async (data) => {
        return new CashMovement({
          id: 'mov-1',
          movementType: data.movementType,
          amount: data.amount,
          paymentMethod: data.paymentMethod,
          reason: data.reason,
          balanceAfter: data.movementType.startsWith('INGRESO') ? 100000 : 50000,
          createdAt: new Date(),
          createdByUserId: data.createdByUserId,
          createdByUsername: 'cajero_1',
        });
      }),
      getCurrentBalance: vi.fn(async () => ({
        currentBalance: 150000,
        totalIncomeToday: 200000,
        totalExpenseToday: 50000,
        movementsCountToday: 5,
        lastMovementAt: new Date().toISOString(),
      })),
      findAll: vi.fn(async () => ({
        items: [
          new CashMovement({
            id: 'mov-1',
            movementType: 'INGRESO_MANUAL',
            amount: 50000,
            paymentMethod: 'EFECTIVO',
            reason: 'Base inicial',
            balanceAfter: 50000,
            createdAt: new Date(),
            createdByUserId: 'user-1',
            createdByUsername: 'cajero_1',
          }),
        ],
        total: 1,
      })),
      findById: vi.fn(async (id: string) => {
        if (id === 'mov-1') {
          return new CashMovement({
            id: 'mov-1',
            movementType: 'INGRESO_MANUAL',
            amount: 50000,
            paymentMethod: 'EFECTIVO',
            reason: 'Base inicial',
            balanceAfter: 50000,
            createdAt: new Date(),
            createdByUserId: 'user-1',
            createdByUsername: 'cajero_1',
          });
        }
        return null;
      }),
    };

    mockAuditService = {
      recordEvent: vi.fn(async () => {}),
    };

    service = new CashService(repository, mockAuditService);
  });

  describe('Entidad de Dominio CashMovement', () => {
    it('crea un movimiento válido y calcula correctamente isIncome() e isExpense()', () => {
      const ingreso = new CashMovement({
        id: 'mov-in',
        movementType: 'INGRESO_MANUAL',
        amount: 25000,
        paymentMethod: 'EFECTIVO',
        reason: 'Aporte de cambio',
        balanceAfter: 25000,
        createdByUserId: 'user-1',
      });

      expect(ingreso.isIncome()).toBe(true);
      expect(ingreso.isExpense()).toBe(false);
      expect(ingreso.affectsPhysicalCash()).toBe(true);

      const egreso = new CashMovement({
        id: 'mov-out',
        movementType: 'EGRESO_PAGO_PROVEEDOR',
        amount: 10000,
        paymentMethod: 'EFECTIVO',
        reason: 'Pago de flete a proveedor',
        balanceAfter: 15000,
        createdByUserId: 'user-1',
      });

      expect(egreso.isIncome()).toBe(false);
      expect(egreso.isExpense()).toBe(true);
    });

    it('rechaza montos menores o iguales a cero con InvalidCashAmountException', () => {
      expect(() => {
        new CashMovement({
          movementType: 'INGRESO_MANUAL',
          amount: 0,
          reason: 'Inválido',
          balanceAfter: 0,
          createdByUserId: 'user-1',
        });
      }).toThrow(InvalidCashAmountException);
    });

    it('rechaza tipos de movimiento no válidos con InvalidCashMovementTypeException', () => {
      expect(() => {
        new CashMovement({
          movementType: 'TIPO_DESCONOCIDO' as any,
          amount: 5000,
          reason: 'Inválido',
          balanceAfter: 5000,
          createdByUserId: 'user-1',
        });
      }).toThrow(InvalidCashMovementTypeException);
    });
  });

  describe('CashService.registerMovement', () => {
    it('registra un movimiento de ingreso y emite evento de auditoría', async () => {
      const result = await service.registerMovement(
        {
          movementType: 'INGRESO_MANUAL',
          amount: 100000,
          paymentMethod: 'EFECTIVO',
          reason: 'Base de caja turno mañana',
        },
        { userId: 'user-cajero', ipAddress: '127.0.0.1', correlationId: 'corr-123' }
      );

      expect(result.id).toBe('mov-1');
      expect(repository.saveTransactional).toHaveBeenCalledTimes(1);
      expect(mockAuditService.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'cash:movement_created',
          entity: 'CashMovement',
          userId: 'user-cajero',
          correlationId: 'corr-123',
        })
      );
    });

    it('falla con BadRequestException si no se provee el usuario actor', async () => {
      await expect(
        service.registerMovement({
          movementType: 'INGRESO_MANUAL',
          amount: 50000,
          reason: 'Sin usuario',
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('transforma InsufficientCashBalanceException en BadRequestException legible', async () => {
      vi.spyOn(repository, 'saveTransactional').mockRejectedValueOnce(
        new InsufficientCashBalanceException(20000, 50000)
      );

      await expect(
        service.registerMovement(
          {
            movementType: 'EGRESO_MANUAL',
            amount: 50000,
            reason: 'Retiro excesivo',
          },
          { userId: 'user-1' }
        )
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('CashService.getBalance & listMovements', () => {
    it('obtiene el balance actual y métricas de caja', async () => {
      const balance = await service.getBalance();

      expect(balance.currentBalance).toBe(150000);
      expect(balance.totalIncomeToday).toBe(200000);
      expect(balance.totalExpenseToday).toBe(50000);
    });

    it('obtiene el listado paginado de movimientos', async () => {
      const paginated = await service.listMovements({ page: 1, limit: 10 });

      expect(paginated.items).toHaveLength(1);
      expect(paginated.total).toBe(1);
      expect(paginated.pageSize).toBe(10);
    });
  });
});
