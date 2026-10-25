import { Injectable } from '@nestjs/common';
import { Prisma, prisma, type CompanyTaxProfile } from '@farmacia/database';
import {
  ICA_ACTIVITIES,
  RUT_RESPONSIBILITY_CODES,
  type CompanyTaxProfileDto,
  type CompanyTaxProfilesDto,
  type CreateCompanyTaxProfilePayload,
  type IcaActivity,
} from '@farmacia/contracts';
import { AuditService } from '../../audit/application/services/audit.service';
import { businessToday } from '../../../common/utils/business-date';
import { taxRuleAt } from '../../taxes/application/tax-catalog.reader';
import { companyTaxStatus } from '../../taxes/domain/tax-engine';
import {
  CompanyConflictError,
  CompanyNotConfiguredError,
  CompanyValidationError,
} from '../domain/company-rules';
import type { CompanyAuditContext } from './company.service';

type ProfileRecord = CompanyTaxProfile & { createdBy: { username: string } | null };

const PER_MIL_RE = /^\d{1,3}(?:\.\d{1,3})?$/;

function toDto(profile: ProfileRecord): CompanyTaxProfileDto {
  const icaRatePerMil = profile.icaRatePerMil?.toFixed(3) ?? null;
  return {
    id: profile.id,
    effectiveFrom: profile.effectiveFrom.toISOString().slice(0, 10),
    responsibilities: profile.responsibilities,
    icaActivity: profile.icaActivity as IcaActivity | null,
    icaRatePerMil,
    icaWithholdingAgent: profile.icaWithholdingAgent,
    reason: profile.reason,
    createdByUsername: profile.createdBy?.username ?? null,
    createdAt: profile.createdAt.toISOString(),
    derived: (({ icaRatePerMil: _rate, ...flags }) => flags)(
      companyTaxStatus({
        responsibilities: profile.responsibilities,
        icaWithholdingAgent: profile.icaWithholdingAgent,
        icaRatePerMil,
      }),
    ),
  };
}

/**
 * Perfil tributario de la empresa (ADR-006, F6): responsabilidades del RUT e ICA, por
 * versiones de solo inserción con vigencia desde hoy o después. Su existencia activa el
 * motor tributario en ventas y compras.
 */
@Injectable()
export class CompanyTaxProfileService {
  constructor(private readonly auditService: AuditService) {}

  async list(): Promise<CompanyTaxProfilesDto> {
    const company = await prisma.company.findFirst({ where: { status: 'ACTIVE' } });
    if (!company) return { current: null, history: [] };
    const history = await prisma.companyTaxProfile.findMany({
      where: { companyId: company.id },
      orderBy: { effectiveFrom: 'desc' },
      include: { createdBy: { select: { username: true } } },
    });
    const today = businessToday();
    const current = history.find((p) => p.effectiveFrom.toISOString().slice(0, 10) <= today);
    return { current: current ? toDto(current) : null, history: history.map(toDto) };
  }

  async create(
    payload: CreateCompanyTaxProfilePayload,
    ctx: CompanyAuditContext,
  ): Promise<CompanyTaxProfileDto> {
    const effectiveFrom = String(payload?.effectiveFrom ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      throw new CompanyValidationError('La fecha de vigencia debe tener formato YYYY-MM-DD.');
    }
    if (effectiveFrom < businessToday()) {
      throw new CompanyValidationError(
        'La vigencia del perfil tributario no puede empezar antes de hoy: no se cambian operaciones ya registradas.',
      );
    }
    const reason = typeof payload?.reason === 'string' ? payload.reason.trim() : '';
    if (!reason || reason.length > 500) {
      throw new CompanyValidationError('Indique el motivo del cambio (máximo 500 caracteres).');
    }
    const responsibilities = this.validateResponsibilities(payload?.responsibilities);
    const icaActivity = payload?.icaActivity ?? null;
    const icaWithholdingAgent = payload?.icaWithholdingAgent === true;
    let icaRatePerMil: string | null = null;
    if (icaActivity !== null) {
      if (!(ICA_ACTIVITIES as readonly string[]).includes(icaActivity)) {
        throw new CompanyValidationError(
          `Actividad de ICA no válida. Opciones: ${ICA_ACTIVITIES.join(', ')}.`,
        );
      }
      const rate = String(payload?.icaRatePerMil ?? '');
      if (!PER_MIL_RE.test(rate)) {
        throw new CompanyValidationError(
          'La tarifa de ICA es un valor por mil con hasta tres decimales.',
        );
      }
      icaRatePerMil = rate;
    } else if (icaWithholdingAgent || payload?.icaRatePerMil) {
      throw new CompanyValidationError(
        'Para registrar tarifa o agente de ReteICA indique la actividad de ICA.',
      );
    }

    return prisma.$transaction(async (tx) => {
      const company = await tx.company.findFirst({ where: { status: 'ACTIVE' } });
      if (!company) throw new CompanyNotConfiguredError();
      if (icaActivity !== null) {
        // La tarifa municipal queda dentro del rango del catálogo normativo
        const rule = await taxRuleAt(tx, `RETEICA_${icaActivity}`, effectiveFrom);
        if (!rule || !rule.rateMinPerMil || !rule.rateMaxPerMil) {
          throw new CompanyValidationError(
            `El catálogo normativo no tiene rango de ICA vigente para ${icaActivity}.`,
          );
        }
        const rate = new Prisma.Decimal(icaRatePerMil!);
        if (rate.lt(rule.rateMinPerMil) || rate.gt(rule.rateMaxPerMil)) {
          throw new CompanyValidationError(
            `La tarifa de ICA para ${icaActivity} debe estar entre ${rule.rateMinPerMil.toFixed(2)} y ${rule.rateMaxPerMil.toFixed(2)} por mil (${rule.legalReference}).`,
          );
        }
      }
      try {
        const created = await tx.companyTaxProfile.create({
          data: {
            companyId: company.id,
            effectiveFrom: new Date(`${effectiveFrom}T00:00:00.000Z`),
            responsibilities,
            icaActivity,
            icaRatePerMil: icaRatePerMil === null ? null : new Prisma.Decimal(icaRatePerMil),
            icaWithholdingAgent,
            reason,
            createdById: ctx.userId,
          },
          include: { createdBy: { select: { username: true } } },
        });
        await this.auditService.recordEvent(
          {
            action: 'company:tax_profile_created',
            entity: 'CompanyTaxProfile',
            entityId: created.id,
            userId: ctx.userId,
            ipAddress: ctx.ipAddress ?? null,
            correlationId: ctx.correlationId ?? null,
            details: {
              effectiveFrom,
              responsibilities,
              icaActivity,
              icaRatePerMil,
              icaWithholdingAgent,
              reason,
            },
          },
          tx,
        );
        return toDto(created);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new CompanyConflictError(
            `Ya existe un perfil tributario con vigencia desde ${effectiveFrom}; elija otra fecha.`,
          );
        }
        throw error;
      }
    });
  }

  private validateResponsibilities(raw: unknown): string[] {
    if (!Array.isArray(raw) || raw.some((code) => typeof code !== 'string')) {
      throw new CompanyValidationError(
        'Las responsabilidades del RUT deben ser una lista de códigos.',
      );
    }
    const codes = [...new Set((raw as string[]).map((code) => code.trim()))].sort();
    const unknown = codes.filter((code) => !RUT_RESPONSIBILITY_CODES.includes(code));
    if (unknown.length > 0) {
      throw new CompanyValidationError(
        `Responsabilidades del RUT no reconocidas: ${unknown.join(', ')}.`,
      );
    }
    if (codes.includes('48') === codes.includes('49')) {
      throw new CompanyValidationError(
        'Indique si la empresa es responsable de IVA (48) o no responsable (49): exactamente una de las dos.',
      );
    }
    return codes;
  }
}
