import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { prisma, Prisma } from '@farmacia/database';
import {
  SYSTEM_PERMISSIONS,
  type CreateCashReceiptPayload,
  type CreateDisbursementPayload,
  type TreasuryDocumentDto,
  type TreasuryDocumentOrigin,
  type TreasuryDocumentType,
  type TreasuryVoucherPaymentMethod,
} from '@farmacia/contracts';
import { businessToday, calendarDate } from '../../../common/utils/business-date';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { CashService } from '../../cash/application/cash.service';
import {
  InsufficientCashBalanceException,
  InvalidCashAmountException,
} from '../../cash/domain/cash.exceptions';
import { ReceivablesService } from '../../receivables/application/receivables.service';
import { PayablesService } from '../../payables/application/payables.service';
import { ExpensesService } from '../../expenses/application/expenses.service';
import { AccountingEngineService } from '../../accounting/application/accounting-engine.service';
import { recordSourceBankMovement } from './record-source-bank-movement';
import { requirePaymentBankAccountId, requirePaymentMethodPermission } from './payment-validation';
import { TreasuryDocumentsService } from './treasury-documents.service';
import {
  centsToMoneyString,
  parseMoneyToCents,
  TreasuryConflictError,
  TreasuryValidationError,
  validateUuid,
} from '../domain/treasury-rules';

type Tx = Prisma.TransactionClient;

export interface VoucherUser {
  id: string;
  permissions: string[];
}

interface Voucher {
  documentType: TreasuryDocumentType;
  origin: Exclude<TreasuryDocumentOrigin, 'AUTOMATICO'>;
  paymentMethod: TreasuryVoucherPaymentMethod;
  bankAccountId: string | null;
  concept: string;
  amountCents: bigint;
  cashMovementType: 'INGRESO_MANUAL' | 'EGRESO_MANUAL' | 'EGRESO_PAGO_PROVEEDOR';
  customerId?: string;
  supplierId?: string;
  thirdPartyId?: string;
  counterpartAccountId?: string;
}

function isIdempotencyKeyCollision(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
    return false;
  const target = error.meta?.target;
  return (
    (Array.isArray(target) && target.some((field) => field === 'key')) ||
    (typeof target === 'string' && /idempotency.*key|key.*idempotency/i.test(target))
  );
}

const MAX_APPLICATIONS = 50;

/**
 * Recibo de caja y comprobante de egreso como documento de origen (ADR-007). En una sola
 * transacción: toma el consecutivo, registra el único movimiento de caja o banco por el total,
 * crea el documento y aplica cada abono o pago de factura con su asiento, o el asiento contra la
 * contrapartida elegida si es un movimiento manual.
 */
@Injectable()
export class TreasuryVouchersService {
  private readonly idempotency = new IdempotencyService();

  constructor(
    private readonly cashService: CashService,
    private readonly receivablesService: ReceivablesService,
    private readonly payablesService: PayablesService,
    private readonly expensesService: ExpensesService,
    private readonly accountingEngine: AccountingEngineService,
    private readonly documentsService: TreasuryDocumentsService,
  ) {}

  async createCashReceipt(
    payload: CreateCashReceiptPayload,
    user: VoucherUser,
    idempotencyKey?: string,
  ): Promise<TreasuryDocumentDto> {
    const base = this.validateBase(payload, user);
    if (payload.kind === 'CARTERA') {
      // Lo autoriza recibo_caja.crear_abono en la ruta; el asiento no exige permiso contable
      const customerId = this.uuid(payload.customerId, 'Cliente');
      const applications = this.applications(payload.applications, (a) => ({
        id: this.uuid(a.receivableId, 'Factura'),
        amountCents: this.money(a.amount, 'Valor abonado'),
      }));
      return this.run('/api/v1/treasury/cash-receipts', payload, user, idempotencyKey, {
        voucher: {
          ...base,
          documentType: 'RECIBO_CAJA',
          origin: 'CARTERA',
          cashMovementType: 'INGRESO_MANUAL',
          customerId,
          amountCents: applications.reduce((acc, a) => acc + a.amountCents, 0n),
        },
        apply: async (tx, documentId) => {
          for (const application of applications) {
            await this.receivablesService.applyPaymentInTransaction(tx, {
              receivableId: application.id,
              amountCents: application.amountCents,
              paymentMethod: base.paymentMethod,
              bankAccountId: base.bankAccountId,
              notes: base.concept,
              userId: user.id,
              treasuryDocumentId: documentId,
              expectedCustomerId: customerId,
            });
          }
        },
      });
    }
    if (payload.kind !== 'MANUAL') {
      throw new BadRequestException('El tipo de recibo debe ser MANUAL o CARTERA.');
    }
    return this.runManual('/api/v1/treasury/cash-receipts', payload, user, idempotencyKey, {
      ...base,
      documentType: 'RECIBO_CAJA',
      origin: 'MANUAL',
      cashMovementType: 'INGRESO_MANUAL',
    });
  }

  async createDisbursement(
    payload: CreateDisbursementPayload,
    user: VoucherUser,
    idempotencyKey?: string,
  ): Promise<TreasuryDocumentDto> {
    const base = this.validateBase(payload, user);
    if (payload.kind === 'PROVEEDOR') {
      const supplierId = this.uuid(payload.supplierId, 'Proveedor');
      const applications = this.applications(payload.applications, (a) => {
        if (a.documentType !== 'FACTURA_COMPRA' && a.documentType !== 'CAUSACION_GASTO') {
          throw new BadRequestException(
            'Cada factura a pagar debe ser FACTURA_COMPRA o CAUSACION_GASTO.',
          );
        }
        return {
          documentType: a.documentType,
          id: this.uuid(a.documentId, 'Factura'),
          amountCents: this.money(a.amount, 'Valor pagado'),
        };
      });
      // Lo autoriza comprobante_egreso.crear en la ruta; el asiento no exige permiso contable
      return this.run('/api/v1/treasury/disbursements', payload, user, idempotencyKey, {
        voucher: {
          ...base,
          documentType: 'COMPROBANTE_EGRESO',
          origin: 'PROVEEDOR',
          cashMovementType: 'EGRESO_PAGO_PROVEEDOR',
          supplierId,
          amountCents: applications.reduce((acc, a) => acc + a.amountCents, 0n),
        },
        apply: async (tx, documentId) => {
          for (const application of applications) {
            if (application.documentType === 'FACTURA_COMPRA') {
              await this.payablesService.applyPaymentInTransaction(tx, {
                payableId: application.id,
                amountCents: application.amountCents,
                paymentMethod: base.paymentMethod,
                bankAccountId: base.bankAccountId,
                notes: base.concept,
                userId: user.id,
                treasuryDocumentId: documentId,
                expectedSupplierId: supplierId,
              });
            } else {
              await this.expensesService.applyPaymentInTransaction(tx, {
                expenseId: application.id,
                amountCents: application.amountCents,
                paymentMethod: base.paymentMethod,
                bankAccountId: base.bankAccountId,
                paymentDate: calendarDate(businessToday()),
                notes: base.concept,
                userId: user.id,
                treasuryDocumentId: documentId,
                expectedSupplierId: supplierId,
              });
            }
          }
        },
      });
    }
    if (payload.kind !== 'MANUAL') {
      throw new BadRequestException('El tipo de egreso debe ser MANUAL o PROVEEDOR.');
    }
    return this.runManual('/api/v1/treasury/disbursements', payload, user, idempotencyKey, {
      ...base,
      documentType: 'COMPROBANTE_EGRESO',
      origin: 'MANUAL',
      cashMovementType: 'EGRESO_MANUAL',
    });
  }

  // ------------------------------------------------------------------ //

  private validateBase(
    payload: CreateCashReceiptPayload | CreateDisbursementPayload,
    user: VoucherUser,
  ) {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
    }
    const method = payload.paymentMethod;
    if (method !== 'EFECTIVO' && method !== 'TRANSFERENCIA') {
      throw new BadRequestException('El medio de pago debe ser EFECTIVO o TRANSFERENCIA.');
    }
    // En un documento manual el usuario elige la contrapartida (permiso contable) y mueve caja
    // o bancos directamente (permiso del auxiliar según el medio)
    if (payload.kind === 'MANUAL') {
      this.requirePermission(
        user,
        SYSTEM_PERMISSIONS.ACCOUNTING_READ,
        'registrar documentos manuales contra una contrapartida contable',
      );
      requirePaymentMethodPermission(user.permissions, method);
    }
    if (method === 'TRANSFERENCIA') {
      requirePaymentBankAccountId(payload.bankAccountId);
    } else if (payload.bankAccountId) {
      throw new BadRequestException('Una cuenta bancaria solo corresponde a TRANSFERENCIA.');
    }
    const concept = typeof payload.concept === 'string' ? payload.concept.trim() : '';
    if (concept.length < 3 || concept.length > 255) {
      throw new BadRequestException('El concepto es obligatorio (entre 3 y 255 caracteres).');
    }
    return {
      paymentMethod: method,
      bankAccountId: method === 'TRANSFERENCIA' ? payload.bankAccountId! : null,
      concept,
    };
  }

  /**
   * La contrapartida de un movimiento manual no puede ser una cuenta de control con auxiliar:
   * caja, bancos, clientes, proveedores o inventario. Moverlas a mano descuadra su auxiliar (p.
   * ej. un "ingreso" contra Clientes bajaría la cartera sin abonar ninguna factura).
   */
  private async assertManualCounterpart(accountId: string): Promise<void> {
    const [mapping, bank] = await Promise.all([
      prisma.companyAccountingMapping.findFirst({
        where: {
          accountId,
          status: 'ACTIVE',
          purpose: { in: ['CASH', 'BANK', 'CUSTOMERS', 'SUPPLIERS', 'INVENTORY'] },
        },
        select: { purpose: true },
      }),
      prisma.bankAccount.findFirst({
        where: { ledgerAccountId: accountId },
        select: { name: true },
      }),
    ]);
    if (mapping || bank) {
      const why =
        mapping?.purpose === 'CUSTOMERS'
          ? 'el abono de un cliente se registra como abono a cartera eligiendo sus facturas'
          : mapping?.purpose === 'SUPPLIERS'
            ? 'el pago a un proveedor se registra como pago a proveedor eligiendo sus facturas'
            : 'su saldo lo mueven solo los documentos que la afectan';
      throw new BadRequestException(
        `La cuenta de contrapartida es una cuenta de control con auxiliar (${bank ? 'cuenta bancaria' : mapping!.purpose}): ${why}.`,
      );
    }
  }

  private async runManual(
    endpoint: string,
    payload: CreateCashReceiptPayload | CreateDisbursementPayload,
    user: VoucherUser,
    idempotencyKey: string | undefined,
    base: Omit<Voucher, 'amountCents' | 'counterpartAccountId' | 'thirdPartyId'>,
  ) {
    const counterpartAccountId = this.uuid(payload.counterpartAccountId, 'Cuenta de contrapartida');
    const thirdPartyId =
      payload.thirdPartyId === undefined ||
      payload.thirdPartyId === null ||
      payload.thirdPartyId === ''
        ? undefined
        : this.uuid(payload.thirdPartyId, 'Tercero');
    if (payload.applications?.length) {
      throw new BadRequestException('Un documento manual no aplica facturas.');
    }
    const voucher: Voucher = {
      ...base,
      amountCents: this.money(payload.amount, 'Valor'),
      counterpartAccountId,
      thirdPartyId,
    };
    await this.assertManualCounterpart(counterpartAccountId);
    if (
      thirdPartyId &&
      !(await prisma.thirdParty.findUnique({ where: { id: thirdPartyId }, select: { id: true } }))
    ) {
      throw new BadRequestException('El tercero indicado no existe.');
    }
    return this.run(endpoint, payload, user, idempotencyKey, {
      voucher,
      apply: async (tx, _documentId, movement) => {
        await this.accountingEngine.handleManualTreasuryMovement(
          {
            sourceType: movement.source === 'CAJA' ? 'CASH_MOVEMENT' : 'BANK_MOVEMENT',
            sourceId: movement.id,
            direction: voucher.documentType === 'RECIBO_CAJA' ? 'IN' : 'OUT',
            amount: centsToMoneyString(voucher.amountCents),
            counterpartAccountId,
            bankAccountId: voucher.bankAccountId,
            description: `${voucher.documentType === 'RECIBO_CAJA' ? 'Recibo de caja' : 'Comprobante de egreso'}: ${voucher.concept}`,
            createdById: user.id,
          },
          tx,
        );
      },
    });
  }

  private async run(
    endpoint: string,
    payload: unknown,
    user: VoucherUser,
    idempotencyKey: string | undefined,
    plan: {
      voucher: Voucher;
      apply: (
        tx: Tx,
        documentId: string,
        movement: { source: 'CAJA' | 'BANCO'; id: string },
      ) => Promise<void>;
    },
  ): Promise<TreasuryDocumentDto> {
    // Todo documento mueve dinero: un reintento sin clave lo duplicaría (AGENTS.md §6)
    const key = idempotencyKey?.trim();
    if (!key)
      throw new BadRequestException('Idempotency-Key es obligatorio para registrar el documento.');
    if (key.length > 100)
      throw new BadRequestException('Idempotency-Key debe tener entre 1 y 100 caracteres.');
    const { voucher } = plan;
    if (voucher.amountCents <= 0n) {
      throw new BadRequestException('El valor del documento debe ser mayor a cero.');
    }
    const requestHash = this.idempotency.computeHash(endpoint, user.id, payload);

    // Dos solicitudes simultáneas con la misma clave: la que pierde el insert de la clave se
    // reintenta en una transacción nueva, que lee y devuelve la respuesta de la ganadora
    const attempt = () =>
      this.idempotency.retryOnSerialization(() =>
        prisma.$transaction(
          async (tx) => {
            const cached = await this.idempotency.getRecord(key, requestHash, tx, 'http');
            if (cached) return cached.responseBody as unknown as TreasuryDocumentDto;

            const documentId = randomUUID();
            const amount = centsToMoneyString(voucher.amountCents);
            const movement = await this.recordMovement(tx, voucher, documentId, amount, user.id);
            const [{ number }] = await tx.$queryRaw<Array<{ number: string }>>`
              SELECT next_treasury_document_number(${voucher.documentType}) AS number
            `;
            await tx.treasuryDocument.create({
              data: {
                id: documentId,
                documentType: voucher.documentType,
                documentNumber: number,
                documentDate: calendarDate(businessToday()),
                amount: new Prisma.Decimal(amount),
                paymentMethod: voucher.paymentMethod,
                concept: voucher.concept,
                origin: voucher.origin,
                customerId: voucher.customerId ?? null,
                supplierId: voucher.supplierId ?? null,
                thirdPartyId: voucher.thirdPartyId ?? null,
                counterpartAccountId: voucher.counterpartAccountId ?? null,
                cashMovementId: movement.source === 'CAJA' ? movement.id : null,
                bankMovementId: movement.source === 'BANCO' ? movement.id : null,
                bankAccountId: voucher.bankAccountId,
                createdById: user.id,
              },
            });
            await plan.apply(tx, documentId, movement);
            await tx.auditEvent.create({
              data: {
                userId: user.id,
                action:
                  voucher.documentType === 'RECIBO_CAJA'
                    ? 'treasury:cash_receipt_created'
                    : 'treasury:disbursement_created',
                entity: 'TreasuryDocument',
                entityId: documentId,
                details: {
                  documentNumber: number,
                  origin: voucher.origin,
                  amount,
                  paymentMethod: voucher.paymentMethod,
                  bankAccountId: voucher.bankAccountId,
                },
              },
            });

            const result = await this.documentsService.getById(documentId, tx);
            await this.idempotency.saveRecord(
              {
                key,
                endpoint,
                requestHash,
                userId: user.id,
                responseStatus: 201,
                responseBody: result,
              },
              tx,
            );
            return result;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );

    try {
      for (let retry = 0; ; retry++) {
        try {
          return await attempt();
        } catch (error) {
          if (!isIdempotencyKeyCollision(error) || retry >= 2) throw error;
        }
      }
    } catch (error) {
      if (
        error instanceof InsufficientCashBalanceException ||
        error instanceof InvalidCashAmountException
      ) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof TreasuryConflictError) throw new ConflictException(error.message);
      if (error instanceof TreasuryValidationError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  /** Único movimiento del documento; el trigger de ADR-002 no emite otro por su referencia. */
  private async recordMovement(
    tx: Tx,
    voucher: Voucher,
    documentId: string,
    amount: string,
    userId: string,
  ): Promise<{ source: 'CAJA' | 'BANCO'; id: string }> {
    if (voucher.paymentMethod === 'TRANSFERENCIA') {
      const id = await recordSourceBankMovement(tx, {
        bankAccountId: voucher.bankAccountId!,
        movementType: voucher.documentType === 'RECIBO_CAJA' ? 'DEPOSIT' : 'WITHDRAWAL',
        amount,
        concept: voucher.concept,
        referenceDocumentType: 'TREASURY_DOCUMENT',
        referenceDocumentId: documentId,
        createdById: userId,
      });
      return { source: 'BANCO', id };
    }
    const id = await this.cashService.recordMovementInTransaction(tx, {
      movementType: voucher.cashMovementType,
      amount,
      paymentMethod: 'EFECTIVO',
      reason: voucher.concept,
      referenceDocumentType: 'TREASURY_DOCUMENT',
      referenceDocumentId: documentId,
      createdByUserId: userId,
    });
    return { source: 'CAJA', id };
  }

  private applications<T, R extends { id: string }>(
    items: T[] | undefined,
    parse: (item: T) => R,
  ): R[] {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('Selecciona al menos una factura.');
    }
    if (items.length > MAX_APPLICATIONS) {
      throw new BadRequestException(
        `Un documento aplica como máximo ${MAX_APPLICATIONS} facturas.`,
      );
    }
    const parsed = items.map(parse);
    if (new Set(parsed.map((a) => a.id)).size !== parsed.length) {
      throw new BadRequestException('Una factura no puede repetirse en el mismo documento.');
    }
    return parsed;
  }

  private money(value: unknown, field: string): bigint {
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new BadRequestException(`${field} es obligatorio.`);
    }
    try {
      const cents = parseMoneyToCents(String(value), field);
      if (cents <= 0n) throw new BadRequestException(`${field} debe ser mayor a cero.`);
      return cents;
    } catch (error) {
      if (error instanceof TreasuryValidationError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private uuid(value: unknown, field: string): string {
    if (typeof value !== 'string') throw new BadRequestException(`${field} es obligatorio.`);
    try {
      validateUuid(value, field);
    } catch (error) {
      if (error instanceof TreasuryValidationError) throw new BadRequestException(error.message);
      throw error;
    }
    return value;
  }

  private requirePermission(user: VoucherUser, permission: string, action: string) {
    if (!user.permissions.includes(permission)) {
      throw new ForbiddenException(`No tiene permiso para ${action}.`);
    }
  }
}
