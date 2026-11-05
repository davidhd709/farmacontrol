import { Injectable } from '@nestjs/common';
import { Prisma } from '@farmacia/database';
import type { CashOpeningDto, IncorporateOpeningCashPayload } from '@farmacia/contracts';
import { businessToday } from '../../../common/utils/business-date';
import {
  AccountingConflictError,
  AccountingNotFoundError,
  AccountingValidationError,
} from '../../accounting/domain/accounting-rules';
import { PrismaCashMovementRepository } from '../infrastructure/prisma-cash-movement.repository';

/** Solo incorpora efectivo ya contabilizado. Nunca llama al motor ni crea un recibo. */
@Injectable()
export class CashOpeningService {
  constructor(private readonly movements: PrismaCashMovementRepository) {}

  async assertDedicatedCompany(tx: Prisma.TransactionClient, expectedId?: string) {
    // ADR-003/006: los auxiliares aún son globales por base. Rechazar una identidad
    // ambigua incluye empresas inactivas: no se puede atribuir su historia con seguridad.
    const companies = await tx.company.findMany({ take: 2 });
    if (
      companies.length !== 1 ||
      companies[0].status !== 'ACTIVE' ||
      (expectedId !== undefined && companies[0].id !== expectedId)
    ) {
      throw new AccountingConflictError(
        'La apertura de Caja requiere una base dedicada con una única empresa activa y la identidad empresarial correcta.',
      );
    }
    return companies[0];
  }

  async incorporate(
    tx: Prisma.TransactionClient,
    journalEntryId: string,
    userId: string,
    expected?: IncorporateOpeningCashPayload,
  ): Promise<CashOpeningDto | null> {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(742189321)::text AS locked`;
    const company = await this.assertDedicatedCompany(tx, expected?.companyId);
    const entry = await tx.journalEntry.findUnique({
      where: { id: journalEntryId },
      include: { lines: true, reversal: true, cashOpening: true },
    });
    if (!entry) throw new AccountingNotFoundError('Asiento de apertura inexistente.');
    if (entry.sourceType !== 'OPENING_BALANCE' || entry.status !== 'POSTED' || entry.reversal) {
      throw new AccountingConflictError('El asiento debe ser una apertura contabilizada vigente.');
    }
    if (entry.cashOpening) {
      throw new AccountingConflictError('Esta apertura ya fue incorporada a Caja.');
    }
    const activeCount = await tx.journalEntry.count({
      where: { sourceType: 'OPENING_BALANCE', status: 'POSTED', reversal: { is: null } },
    });
    if (activeCount !== 1) {
      throw new AccountingConflictError(
        'Hay aperturas vigentes ambiguas; se requiere revisión contable.',
      );
    }
    const mappingAt = (date: Date) =>
      tx.companyAccountingMapping.findMany({
        where: {
          purpose: 'CASH',
          status: 'ACTIVE',
          accountId: { not: null },
          effectiveFrom: { lte: date },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
          account: { isActive: true, allowsMovement: true },
        },
        take: 2,
      });
    const mappings = await mappingAt(entry.entryDate);
    const currentMappings = await mappingAt(new Date(`${businessToday()}T00:00:00.000Z`));
    if (
      mappings.length !== 1 ||
      currentMappings.length !== 1 ||
      mappings[0].accountId !== currentMappings[0].accountId
    ) {
      throw new AccountingConflictError(
        'CASH requiere un mapeo único, imputable y consistente entre la fecha de apertura y hoy.',
      );
    }
    const accountId = mappings[0].accountId!;
    const amount = entry.lines
      .filter((line) => line.accountId === accountId)
      .reduce((sum, line) => sum.plus(line.debit).minus(line.credit), new Prisma.Decimal(0));
    if (amount.isNegative() || amount.gte('10000000000')) {
      throw new AccountingValidationError(
        'El efectivo de apertura debe ser no negativo y caber en la precisión de Caja.',
      );
    }
    if (expected && (expected.accountId !== accountId || !amount.eq(expected.expectedAmount))) {
      throw new AccountingConflictError(
        'La cuenta CASH o el valor contabilizado no coincide con lo esperado.',
      );
    }
    if (amount.isZero()) {
      if (expected)
        throw new AccountingConflictError(
          'La apertura no contiene efectivo positivo para incorporar.',
        );
      return null;
    }
    // Incluso un historial cuyo saldo vuelva a cero hace inseguro insertar una base inicial.
    if (await tx.cashMovement.count()) {
      throw new AccountingConflictError(
        'Caja ya tiene movimientos. No se modifica ni recalcula su historial; se requiere un diseño de corrección específico.',
      );
    }
    const ledger = await tx.journalEntryLine.aggregate({
      where: { accountId, journalEntry: { status: 'POSTED' } },
      _sum: { debit: true, credit: true },
    });
    const ledgerBalance = (ledger._sum.debit ?? new Prisma.Decimal(0)).minus(
      ledger._sum.credit ?? new Prisma.Decimal(0),
    );
    if (!ledgerBalance.eq(amount)) {
      throw new AccountingConflictError(
        'El saldo contable de CASH incluye otros movimientos; no es seguro inicializar Caja.',
      );
    }
    const movement = await this.movements.saveTransactional(
      {
        movementType: 'SALDO_APERTURA',
        amount: amount.toFixed(2),
        paymentMethod: 'EFECTIVO',
        reason: `Saldo de apertura ${entry.entryDate.toISOString().slice(0, 10)}`,
        referenceDocumentType: 'OPENING_BALANCE',
        referenceDocumentId: entry.id,
        createdByUserId: userId,
      },
      tx,
    );
    const opening = await tx.cashOpening.create({
      data: {
        companyId: company.id,
        journalEntryId: entry.id,
        cashMovementId: movement.id,
        accountId,
        amount,
        effectiveDate: entry.entryDate,
        createdById: userId,
      },
    });
    await tx.auditEvent.create({
      data: {
        userId,
        action: 'cash:opening_incorporated',
        entity: 'CashOpening',
        entityId: opening.id,
        details: {
          companyId: company.id,
          journalEntryId: entry.id,
          accountId,
          cashMovementId: movement.id,
          amount: amount.toFixed(2),
          effectiveDate: entry.entryDate.toISOString().slice(0, 10),
          mode: expected ? 'EXISTING_OPENING' : 'NEW_OPENING',
          reason: expected?.reason ?? entry.description,
        },
      },
    });
    return {
      ...opening,
      amount: opening.amount.toFixed(2),
      effectiveDate: opening.effectiveDate.toISOString().slice(0, 10),
      createdAt: opening.createdAt.toISOString(),
    };
  }
}
