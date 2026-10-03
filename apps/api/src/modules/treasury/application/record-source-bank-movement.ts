import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@farmacia/database';
import {
  calculateNewBalanceCents,
  centsToMoneyString,
  parseMoneyToCents,
  validateUuid,
} from '../domain/treasury-rules';

/** Registers the source document and its bank balance change in the caller's transaction. */
export async function recordSourceBankMovement(
  tx: Prisma.TransactionClient,
  input: {
    bankAccountId: string;
    movementType: 'DEPOSIT' | 'WITHDRAWAL';
    amount: string;
    concept: string;
    referenceDocumentType: string;
    referenceDocumentId: string;
    createdById: string;
  },
): Promise<void> {
  try {
    validateUuid(input.bankAccountId, 'ID de cuenta bancaria');
    const amountCents = parseMoneyToCents(input.amount, 'Importe de transferencia');
    const rows = await tx.$queryRaw<Array<{ current_balance: Prisma.Decimal; is_active: boolean }>>`
      SELECT current_balance, is_active
      FROM bank_accounts
      WHERE id = ${input.bankAccountId}::uuid
      FOR UPDATE
    `;
    if (!rows.length) throw new NotFoundException('Cuenta bancaria no encontrada.');
    if (!rows[0].is_active) throw new BadRequestException('La cuenta bancaria está inactiva.');

    const beforeCents = parseMoneyToCents(rows[0].current_balance.toString(), 'Saldo bancario');
    const { balanceBefore, balanceAfter } = calculateNewBalanceCents(
      beforeCents,
      input.movementType,
      amountCents,
      false,
    );

    await tx.bankAccount.update({
      where: { id: input.bankAccountId },
      data: { currentBalance: new Prisma.Decimal(centsToMoneyString(balanceAfter)) },
    });
    const movement = await tx.bankMovement.create({
      data: {
        bankAccountId: input.bankAccountId,
        movementType: input.movementType,
        amount: new Prisma.Decimal(centsToMoneyString(amountCents)),
        balanceBefore: new Prisma.Decimal(centsToMoneyString(balanceBefore)),
        balanceAfter: new Prisma.Decimal(centsToMoneyString(balanceAfter)),
        concept: input.concept,
        referenceDocumentType: input.referenceDocumentType,
        referenceDocumentId: input.referenceDocumentId,
        createdById: input.createdById,
      },
    });
    await tx.auditEvent.create({
      data: {
        action: 'treasury:source_bank_movement_created',
        entity: 'BankMovement',
        entityId: movement.id,
        userId: input.createdById,
        details: {
          bankAccountId: input.bankAccountId,
          movementType: input.movementType,
          amount: centsToMoneyString(amountCents),
          referenceDocumentType: input.referenceDocumentType,
          referenceDocumentId: input.referenceDocumentId,
        },
      },
    });
  } catch (error) {
    if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
    if (error instanceof Error && error.name === 'TreasuryValidationError') {
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}
