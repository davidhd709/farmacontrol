import { Injectable } from '@nestjs/common';
import { prisma, Prisma } from '@farmacia/database';
import {
  AVAILABLE_COSTING_METHODS,
  type AccountingPolicyDto,
  type BranchDto,
  type CompanyDto,
  type CompanySettingsDto,
  type CreateAccountingPolicyPayload,
  type CreateBranchPayload,
  type SetupCompanyPayload,
  type UpdateCompanyPayload,
} from '@farmacia/contracts';
import { AuditService } from '../../audit/application/services/audit.service';
import { businessToday } from '../../../common/utils/business-date';
import {
  CompanyConflictError,
  CompanyNotConfiguredError,
  CompanyValidationError,
  DEFAULT_ACCOUNTING_POLICY,
  assertCostingMethodChangeDate,
  assertMunicipalityCode,
  assertSectorProfile,
  assertValidNit,
  validatePolicyValues,
} from '../domain/company-rules';
import { accountingPolicyAt } from './accounting-policy.reader';

export interface CompanyAuditContext {
  userId: string;
  ipAddress?: string | null;
  correlationId?: string | null;
}

const companyInclude = { branches: { orderBy: { code: 'asc' as const } } } as const;
type CompanyRecord = Prisma.CompanyGetPayload<{ include: typeof companyInclude }>;
type PolicyRecord = Prisma.CompanyAccountingPolicyGetPayload<{
  include: { createdBy: { select: { username: true } } };
}>;

function text(value: unknown, label: string, max: number, required: boolean): string | null {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    if (required) throw new CompanyValidationError(`${label} es obligatorio.`);
    return null;
  }
  if (typeof value !== 'string') throw new CompanyValidationError(`${label} debe ser texto.`);
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new CompanyValidationError(`${label} admite como máximo ${max} caracteres.`);
  }
  return trimmed;
}

function toBranchDto(branch: CompanyRecord['branches'][number]): BranchDto {
  return {
    id: branch.id,
    code: branch.code,
    name: branch.name,
    address: branch.address,
    municipalityCode: branch.municipalityCode,
    isDefault: branch.isDefault,
    isActive: branch.isActive,
  };
}

function toCompanyDto(company: CompanyRecord): CompanyDto {
  return {
    id: company.id,
    legalName: company.legalName,
    tradeName: company.tradeName,
    taxId: company.taxId,
    taxIdCheckDigit: company.taxIdCheckDigit,
    sectorProfile: company.sectorProfile as CompanyDto['sectorProfile'],
    address: company.address,
    municipalityCode: company.municipalityCode,
    email: company.email,
    phone: company.phone,
    branches: company.branches.map(toBranchDto),
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
  };
}

function toPolicyDto(policy: PolicyRecord): AccountingPolicyDto {
  return {
    id: policy.id,
    effectiveFrom: policy.effectiveFrom.toISOString().slice(0, 10),
    costingMethod: policy.costingMethod as AccountingPolicyDto['costingMethod'],
    openingCostSource: policy.openingCostSource as AccountingPolicyDto['openingCostSource'],
    purchaseReturnVariancePurpose:
      policy.purchaseReturnVariancePurpose as AccountingPolicyDto['purchaseReturnVariancePurpose'],
    bonusUnitsTreatment: policy.bonusUnitsTreatment as AccountingPolicyDto['bonusUnitsTreatment'],
    reason: policy.reason,
    createdByName: policy.createdBy?.username ?? null,
    createdAt: policy.createdAt.toISOString(),
    isDefault: false,
  };
}

const DEFAULT_POLICY_DTO: AccountingPolicyDto = {
  id: null,
  effectiveFrom: null,
  ...DEFAULT_ACCOUNTING_POLICY,
  reason: null,
  createdByName: null,
  createdAt: null,
  isDefault: true,
};

/**
 * Empresa y políticas contables (ADR-006, F3). En modo dedicado se configura una única
 * empresa; cada cambio de política es una versión nueva con vigencia desde hoy o después.
 */
@Injectable()
export class CompanyService {
  constructor(private readonly auditService: AuditService) {}

  async getSettings(): Promise<CompanySettingsDto> {
    const company = await prisma.company.findFirst({
      where: { status: 'ACTIVE' },
      include: companyInclude,
    });
    const history = company
      ? await prisma.companyAccountingPolicy.findMany({
          where: { companyId: company.id },
          orderBy: { effectiveFrom: 'desc' },
          include: { createdBy: { select: { username: true } } },
        })
      : [];
    const current = await accountingPolicyAt(prisma, businessToday());
    const currentDto = history.find((p) => p.id === current.id);
    return {
      company: company ? toCompanyDto(company) : null,
      currentPolicy: currentDto ? toPolicyDto(currentDto) : DEFAULT_POLICY_DTO,
      policyHistory: history.map(toPolicyDto),
      availableCostingMethods: [...AVAILABLE_COSTING_METHODS],
    };
  }

  async setup(payload: SetupCompanyPayload, ctx: CompanyAuditContext): Promise<CompanyDto> {
    const taxId = text(payload?.taxId, 'El NIT', 15, true)!;
    const taxIdCheckDigit = text(payload?.taxIdCheckDigit, 'El dígito de verificación', 1, true)!;
    assertValidNit(taxId, taxIdCheckDigit);
    assertSectorProfile(payload.sectorProfile);
    assertMunicipalityCode(payload.municipalityCode);
    assertMunicipalityCode(payload.branch?.municipalityCode);
    const data = {
      legalName: text(payload.legalName, 'La razón social', 200, true)!,
      tradeName: text(payload.tradeName, 'El nombre comercial', 200, false),
      address: text(payload.address, 'La dirección', 250, false),
      email: text(payload.email, 'El correo', 150, false),
      phone: text(payload.phone, 'El teléfono', 30, false),
    };
    const branch = {
      code: text(payload.branch?.code, 'El código de la sucursal', 20, true)!,
      name: text(payload.branch?.name, 'El nombre de la sucursal', 150, true)!,
      address: text(payload.branch?.address, 'La dirección de la sucursal', 250, false),
    };

    const created = await prisma
      .$transaction(
        async (tx) => {
          if (await tx.company.findFirst({ where: { status: 'ACTIVE' } })) {
            throw new CompanyConflictError(
              'La empresa ya está configurada; en modo dedicado solo existe una.',
            );
          }
          const company = await tx.company.create({
            data: {
              ...data,
              taxId,
              taxIdCheckDigit,
              sectorProfile: payload.sectorProfile,
              municipalityCode: payload.municipalityCode ?? null,
              branches: {
                create: {
                  ...branch,
                  municipalityCode: payload.branch.municipalityCode ?? null,
                  isDefault: true,
                },
              },
            },
            include: companyInclude,
          });
          await this.auditService.recordEvent(
            {
              action: 'company:setup',
              entity: 'Company',
              entityId: company.id,
              userId: ctx.userId,
              ipAddress: ctx.ipAddress ?? null,
              correlationId: ctx.correlationId ?? null,
              details: { taxId, sectorProfile: payload.sectorProfile, branchCode: branch.code },
            },
            tx,
          );
          return company;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      .catch((error: unknown) => {
        // La unicidad de la base de datos cierra la carrera entre dos configuraciones simultáneas
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new CompanyConflictError('La empresa ya está configurada o el NIT ya existe.');
        }
        throw error;
      });
    return toCompanyDto(created);
  }

  async update(payload: UpdateCompanyPayload, ctx: CompanyAuditContext): Promise<CompanyDto> {
    const changes: Prisma.CompanyUpdateInput = {};
    if (payload?.legalName !== undefined) {
      changes.legalName = text(payload.legalName, 'La razón social', 200, true)!;
    }
    if (payload?.tradeName !== undefined) {
      changes.tradeName = text(payload.tradeName, 'El nombre comercial', 200, false);
    }
    if (payload?.address !== undefined) {
      changes.address = text(payload.address, 'La dirección', 250, false);
    }
    if (payload?.municipalityCode !== undefined) {
      assertMunicipalityCode(payload.municipalityCode);
      changes.municipalityCode = payload.municipalityCode ?? null;
    }
    if (payload?.email !== undefined) changes.email = text(payload.email, 'El correo', 150, false);
    if (payload?.phone !== undefined) changes.phone = text(payload.phone, 'El teléfono', 30, false);

    return prisma.$transaction(async (tx) => {
      const company = await this.activeCompany(tx);
      const updated = await tx.company.update({
        where: { id: company.id },
        data: changes,
        include: companyInclude,
      });
      await this.auditService.recordEvent(
        {
          action: 'company:update',
          entity: 'Company',
          entityId: company.id,
          userId: ctx.userId,
          ipAddress: ctx.ipAddress ?? null,
          correlationId: ctx.correlationId ?? null,
          details: { fields: Object.keys(changes) },
        },
        tx,
      );
      return toCompanyDto(updated);
    });
  }

  async createBranch(payload: CreateBranchPayload, ctx: CompanyAuditContext): Promise<BranchDto> {
    assertMunicipalityCode(payload?.municipalityCode);
    const data = {
      code: text(payload?.code, 'El código de la sucursal', 20, true)!,
      name: text(payload?.name, 'El nombre de la sucursal', 150, true)!,
      address: text(payload?.address, 'La dirección de la sucursal', 250, false),
      municipalityCode: payload?.municipalityCode ?? null,
    };
    return prisma
      .$transaction(async (tx) => {
        const company = await this.activeCompany(tx);
        const branch = await tx.branch.create({ data: { ...data, companyId: company.id } });
        await this.auditService.recordEvent(
          {
            action: 'company:branch_created',
            entity: 'Branch',
            entityId: branch.id,
            userId: ctx.userId,
            ipAddress: ctx.ipAddress ?? null,
            correlationId: ctx.correlationId ?? null,
            details: { code: branch.code },
          },
          tx,
        );
        return toBranchDto(branch);
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new CompanyConflictError(`Ya existe una sucursal con el código ${data.code}.`);
        }
        throw error;
      });
  }

  async createPolicy(
    payload: CreateAccountingPolicyPayload,
    ctx: CompanyAuditContext,
  ): Promise<AccountingPolicyDto> {
    const values = validatePolicyValues((payload ?? {}) as unknown as Record<string, unknown>);
    const reason = text(payload?.reason, 'El motivo del cambio', 500, true)!;
    const effectiveFrom = text(payload?.effectiveFrom, 'La fecha de vigencia', 10, true)!;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      throw new CompanyValidationError('La fecha de vigencia debe tener formato YYYY-MM-DD.');
    }
    // Una política nueva no cambia operaciones ya registradas
    if (effectiveFrom < businessToday()) {
      throw new CompanyValidationError(
        'La vigencia de una política no puede empezar antes de hoy: no se cambian operaciones ya registradas.',
      );
    }

    return prisma
      .$transaction(
        async (tx) => {
          const company = await this.activeCompany(tx);
          const previous = await accountingPolicyAt(tx, effectiveFrom);
          // ADR-006 (F5): el método cambia solo al iniciar un período futuro; el período en
          // curso cierra con el anterior y cada saldo se convierte sin cambiar su valor total
          if (previous.costingMethod !== values.costingMethod) {
            assertCostingMethodChangeDate(effectiveFrom, businessToday());
          }
          const policy = await tx.companyAccountingPolicy.create({
            data: {
              companyId: company.id,
              effectiveFrom: new Date(`${effectiveFrom}T00:00:00.000Z`),
              ...values,
              reason,
              createdById: ctx.userId,
            },
            include: { createdBy: { select: { username: true } } },
          });
          await this.auditService.recordEvent(
            {
              action: 'company:accounting_policy_created',
              entity: 'CompanyAccountingPolicy',
              entityId: policy.id,
              userId: ctx.userId,
              ipAddress: ctx.ipAddress ?? null,
              correlationId: ctx.correlationId ?? null,
              details: { effectiveFrom, ...values, reason },
            },
            tx,
          );
          return toPolicyDto(policy);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new CompanyConflictError(
            `Ya existe una política con vigencia desde ${effectiveFrom}; elija otra fecha.`,
          );
        }
        throw error;
      });
  }

  private async activeCompany(tx: Prisma.TransactionClient) {
    const company = await tx.company.findFirst({ where: { status: 'ACTIVE' } });
    if (!company) throw new CompanyNotConfiguredError();
    return company;
  }
}
