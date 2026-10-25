import { businessToday } from '../../../common/utils/business-date';
import { Injectable } from '@nestjs/common';
import {
  Prisma,
  prisma,
  type ProductTaxProfile as DbProfile,
  type TaxRule,
} from '@farmacia/database';
import {
  PRODUCT_TAX_OPERATIONS,
  PRODUCT_TAX_TREATMENTS,
  type ProductTaxOperation,
  type ProductTaxProfileDto,
  type ProductTaxProfileInput,
  type ProductTaxTreatment,
  type UpdateProductTaxProfileInput,
} from '@farmacia/contracts';
import { taxRuleAt } from '../../taxes/application/tax-catalog.reader';
import {
  AccountingConflictError,
  AccountingNotFoundError,
  AccountingValidationError,
} from '../domain/accounting-rules';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Tx = Prisma.TransactionClient;

function dateText(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseDate(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new AccountingValidationError(`${field} debe tener formato YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || dateText(date) !== value)
    throw new AccountingValidationError(`${field} es una fecha inválida.`);
  return date;
}

function validateKeys(raw: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new AccountingValidationError('Datos de perfil tributario inválidos.');
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).some((key) => !allowed.includes(key)))
    throw new AccountingValidationError('El perfil contiene campos no permitidos.');
  return body;
}

function normalizeReference(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.trim().length > 500)
    throw new AccountingValidationError('Referencia documental inválida (máximo 500 caracteres).');
  return value.trim() || null;
}

type ProfileWithRule = DbProfile & { taxRule?: Pick<TaxRule, 'code'> | null };

/**
 * F6 (ADR-006): el perfil se clasifica con una regla IVA o INC del catálogo normativo vigente
 * al inicio de la vigencia. Tratamiento y tarifa se copian de la regla: no se escriben a mano.
 */
async function normalizeFields(
  tx: Tx,
  raw: Record<string, unknown>,
): Promise<{
  taxType: 'IVA' | 'INC';
  taxRuleId: string;
  treatment: ProductTaxTreatment;
  ratePct: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  documentReference: string | null;
}> {
  if (typeof raw.taxRuleCode !== 'string' || !raw.taxRuleCode.trim())
    throw new AccountingValidationError(
      'Seleccione la regla del catálogo normativo (taxRuleCode).',
    );
  const effectiveFrom = parseDate(raw.effectiveFrom, 'effectiveFrom');
  const effectiveTo = raw.effectiveTo == null ? null : parseDate(raw.effectiveTo, 'effectiveTo');
  if (effectiveTo && effectiveTo < effectiveFrom)
    throw new AccountingValidationError('effectiveTo no puede ser anterior a effectiveFrom.');
  const rule = await taxRuleAt(tx, raw.taxRuleCode.trim(), dateText(effectiveFrom));
  if (!rule)
    throw new AccountingValidationError(
      `La regla "${raw.taxRuleCode}" no está vigente en el catálogo normativo el ${dateText(effectiveFrom)}.`,
    );
  if (rule.taxType !== 'IVA' && rule.taxType !== 'INC')
    throw new AccountingValidationError('Un producto solo se clasifica con reglas de IVA o INC.');
  return {
    taxType: rule.taxType,
    taxRuleId: rule.id,
    treatment: (rule.treatment ?? 'GRAVADO') as ProductTaxTreatment,
    ratePct: rule.ratePct!.toFixed(4),
    effectiveFrom,
    effectiveTo,
    documentReference: normalizeReference(raw.documentReference),
  };
}

function toDto(profile: ProfileWithRule): ProductTaxProfileDto {
  return {
    id: profile.id,
    productId: profile.productId,
    operation: profile.operation,
    taxType: profile.taxType as ProductTaxProfileDto['taxType'],
    taxRuleCode: profile.taxRule?.code ?? null,
    treatment: profile.treatment,
    ratePct: profile.ratePct?.toFixed(4) ?? null,
    status: profile.status,
    effectiveFrom: dateText(profile.effectiveFrom),
    effectiveTo: profile.effectiveTo ? dateText(profile.effectiveTo) : null,
    documentReference: profile.documentReference,
    activatedById: profile.activatedById,
    activatedAt: profile.activatedAt?.toISOString() ?? null,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

function validateProductId(productId: unknown): asserts productId is string {
  if (typeof productId !== 'string' || !UUID_RE.test(productId))
    throw new AccountingValidationError('ID de producto inválido.');
}

function validateOperation(operation: unknown): asserts operation is ProductTaxOperation {
  if (!PRODUCT_TAX_OPERATIONS.includes(operation as ProductTaxOperation))
    throw new AccountingValidationError('Operación tributaria inválida.');
}

@Injectable()
export class ProductTaxProfileService {
  async create(raw: ProductTaxProfileInput, userId: string): Promise<ProductTaxProfileDto> {
    const body = validateKeys(raw, [
      'productId',
      'operation',
      'taxRuleCode',
      'effectiveFrom',
      'effectiveTo',
      'documentReference',
    ]);
    validateProductId(body.productId);
    validateOperation(body.operation);
    return prisma.$transaction(async (tx) => {
      if (
        !(await tx.product.findUnique({
          where: { id: body.productId as string },
          select: { id: true },
        }))
      )
        throw new AccountingNotFoundError('Producto inexistente.');
      const fields = await normalizeFields(tx, body);
      if (fields.taxType === 'INC' && body.operation !== 'SALE')
        throw new AccountingValidationError('El INC se clasifica solo para la venta.');
      const created = await tx.productTaxProfile.create({
        data: {
          productId: body.productId as string,
          operation: body.operation as ProductTaxOperation,
          ...fields,
        },
        include: { taxRule: { select: { code: true } } },
      });
      await tx.auditEvent.create({
        data: {
          action: 'accounting:tax_profile_created',
          entity: 'ProductTaxProfile',
          entityId: created.id,
          userId,
          details: { after: toDto(created) } as unknown as Prisma.InputJsonValue,
        },
      });
      return toDto(created);
    });
  }

  async list(productId: string, operation?: string): Promise<ProductTaxProfileDto[]> {
    validateProductId(productId);
    if (operation !== undefined) validateOperation(operation);
    return (
      await prisma.productTaxProfile.findMany({
        where: { productId, ...(operation ? { operation: operation as ProductTaxOperation } : {}) },
        include: { taxRule: { select: { code: true } } },
        orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      })
    ).map(toDto);
  }

  async effective(
    productId: string,
    operation: string,
    date: string,
  ): Promise<ProductTaxProfileDto> {
    validateProductId(productId);
    validateOperation(operation);
    const effectiveDate = parseDate(date, 'date');
    const profile = await prisma.productTaxProfile.findFirst({
      where: {
        productId,
        operation: operation as ProductTaxOperation,
        status: 'ACTIVE',
        effectiveFrom: { lte: effectiveDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveDate } }],
        taxType: 'IVA',
      },
      include: { taxRule: { select: { code: true } } },
    });
    if (!profile)
      throw new AccountingNotFoundError('No existe perfil tributario activo para esa fecha.');
    return toDto(profile);
  }

  async update(
    id: string,
    raw: UpdateProductTaxProfileInput,
    userId: string,
  ): Promise<ProductTaxProfileDto> {
    if (!UUID_RE.test(id)) throw new AccountingValidationError('ID de perfil inválido.');
    const body = validateKeys(raw, [
      'taxRuleCode',
      'effectiveFrom',
      'effectiveTo',
      'documentReference',
    ]);
    if (!Object.keys(body).length)
      throw new AccountingValidationError('No hay campos para actualizar.');
    return prisma.$transaction(async (tx) => {
      const current = await tx.productTaxProfile.findUnique({
        where: { id },
        include: { taxRule: { select: { code: true } } },
      });
      if (!current) throw new AccountingNotFoundError('Perfil tributario inexistente.');
      if (current.status !== 'DRAFT')
        throw new AccountingConflictError('Un perfil activo no puede editarse.');
      const fields = await normalizeFields(tx, {
        taxRuleCode: body.taxRuleCode ?? current.taxRule?.code,
        effectiveFrom: body.effectiveFrom ?? dateText(current.effectiveFrom),
        effectiveTo: Object.hasOwn(body, 'effectiveTo')
          ? body.effectiveTo
          : current.effectiveTo
            ? dateText(current.effectiveTo)
            : null,
        documentReference: Object.hasOwn(body, 'documentReference')
          ? body.documentReference
          : current.documentReference,
      });
      const result = await tx.productTaxProfile.updateMany({
        where: { id, status: 'DRAFT' },
        data: fields,
      });
      if (!result.count) throw new AccountingConflictError('El perfil cambió de estado.');
      const updated = await tx.productTaxProfile.findUniqueOrThrow({
        where: { id },
        include: { taxRule: { select: { code: true } } },
      });
      await tx.auditEvent.create({
        data: {
          action: 'accounting:tax_profile_updated',
          entity: 'ProductTaxProfile',
          entityId: id,
          userId,
          details: {
            before: toDto(current),
            after: toDto(updated),
          } as unknown as Prisma.InputJsonValue,
        },
      });
      return toDto(updated);
    });
  }

  async activate(id: string, userId: string): Promise<ProductTaxProfileDto> {
    if (!UUID_RE.test(id)) throw new AccountingValidationError('ID de perfil inválido.');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await prisma.$transaction(
          async (tx) => {
            const profile = await tx.productTaxProfile.findUnique({ where: { id } });
            if (!profile) throw new AccountingNotFoundError('Perfil tributario inexistente.');
            if (profile.status !== 'DRAFT')
              throw new AccountingConflictError('El perfil ya está activo.');
            if (!profile.documentReference?.trim())
              throw new AccountingValidationError('La activación exige referencia documental.');
            if (profile.ratePct === null)
              throw new AccountingValidationError('La activación exige tarifa verificada.');
            const today = businessToday();
            if (dateText(profile.effectiveFrom) < today)
              throw new AccountingValidationError('La activación retroactiva no está permitida.');
            const overlap = await tx.productTaxProfile.findFirst({
              where: {
                id: { not: id },
                productId: profile.productId,
                operation: profile.operation,
                taxType: profile.taxType,
                status: 'ACTIVE',
                effectiveFrom: { lte: profile.effectiveTo ?? new Date('9999-12-31T00:00:00.000Z') },
                OR: [{ effectiveTo: null }, { effectiveTo: { gte: profile.effectiveFrom } }],
              },
              select: { id: true },
            });
            if (overlap)
              throw new AccountingConflictError(
                'Ya existe un perfil activo con vigencia superpuesta.',
              );
            const changed = await tx.productTaxProfile.updateMany({
              where: { id, status: 'DRAFT' },
              data: { status: 'ACTIVE', activatedById: userId, activatedAt: new Date() },
            });
            if (!changed.count) throw new AccountingConflictError('El perfil cambió de estado.');
            const active = await tx.productTaxProfile.findUniqueOrThrow({
              where: { id },
              include: { taxRule: { select: { code: true } } },
            });
            await tx.auditEvent.create({
              data: {
                action: 'accounting:tax_profile_activated',
                entity: 'ProductTaxProfile',
                entityId: id,
                userId,
                details: {
                  productId: active.productId,
                  operation: active.operation,
                  effectiveFrom: dateText(active.effectiveFrom),
                  effectiveTo: active.effectiveTo ? dateText(active.effectiveTo) : null,
                  documentReference: active.documentReference,
                } as Prisma.InputJsonValue,
              },
            });
            return toDto(active);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < 2
        )
          continue;
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2002', 'P2004', 'P2034'].includes(error.code)
        )
          throw new AccountingConflictError('Conflicto al activar el perfil tributario.');
        throw error;
      }
    }
    throw new AccountingConflictError('No fue posible activar el perfil tributario.');
  }
}
