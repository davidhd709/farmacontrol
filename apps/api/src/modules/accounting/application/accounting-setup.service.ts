import { Injectable } from '@nestjs/common';
import { Prisma, prisma } from '@farmacia/database';
import type {
  AccountingPurpose,
  AccountingSetupCheckDto,
  AccountingSetupDto,
  ApplyPucTemplateResultDto,
  CreateOpeningBalancePayload,
  OpeningBalanceDto,
} from '@farmacia/contracts';
import { businessToday } from '../../../common/utils/business-date';
import { accountingPolicyAt } from '../../company/application/accounting-policy.reader';
import { companyTaxProfileAt } from '../../taxes/application/tax-context.reader';
import { AccountingRepository } from '../infrastructure/accounting.repository';
import { JournalService } from './journal.service';
import {
  AccountingConflictError,
  AccountingNotFoundError,
  AccountingValidationError,
} from '../domain/accounting-rules';
import { pucParentCode, requiredPurposes } from '../domain/accounting-setup-rules';
import { PUC_TEMPLATES, type PucTemplate } from '../domain/puc-templates/pharmacy';

const OPENING_SOURCE = 'OPENING_BALANCE';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONEY_RE = /^\d{1,15}(\.\d{1,2})?$/;

function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

/**
 * Asistente de configuración contable (ADR-006, F7): plantilla PUC del perfil sectorial,
 * saldos de apertura y la lista de verificación del estado READY.
 */
@Injectable()
export class AccountingSetupService {
  constructor(
    private readonly repository: AccountingRepository,
    private readonly journal: JournalService,
  ) {}

  private template(): PucTemplate {
    // Hasta que haya otros perfiles sectoriales, toda empresa usa la plantilla de farmacia
    return PUC_TEMPLATES.PHARMACY;
  }

  async status(): Promise<AccountingSetupDto> {
    const today = businessToday();
    const template = this.template();
    const company = await prisma.company.findFirst({ where: { status: 'ACTIVE' } });
    const movementAccounts = await prisma.account.count({
      where: { isActive: true, allowsMovement: true },
    });
    const mappings = await this.repository.listMappings();
    const mapped = new Set(
      mappings
        .filter((m) => m.status === 'ACTIVE' && m.account?.isActive && m.account.allowsMovement)
        .map((m) => m.purpose),
    );
    const policy = await accountingPolicyAt(prisma, today);
    const taxEngineActive = Boolean(await companyTaxProfileAt(prisma, today));
    const required = requiredPurposes({
      usesInventoryCostVariance: policy.purchaseReturnVariancePurpose === 'INVENTORY_COST_VARIANCE',
      taxEngineActive,
    });
    const purposeCheck = (
      key: AccountingSetupCheckDto['key'],
      label: string,
      purposes: AccountingPurpose[],
      requiredCheck: boolean,
      notApplicable?: string,
    ): AccountingSetupCheckDto => {
      const missing = purposes.filter((p) => !mapped.has(p));
      return {
        key,
        label,
        ok: missing.length === 0,
        required: requiredCheck,
        detail:
          purposes.length === 0 && notApplicable
            ? notApplicable
            : missing.length === 0
              ? `${purposes.length} propósitos mapeados.`
              : `Faltan ${missing.length} de ${purposes.length} propósitos.`,
        missingPurposes: missing,
      };
    };

    const opening = await this.activeOpeningEntry();
    const inventory = await this.inventoryReconciliation(mappings);
    const checks: AccountingSetupCheckDto[] = [
      {
        key: 'COMPANY',
        label: 'Empresa configurada',
        ok: Boolean(company),
        required: true,
        detail: company
          ? company.legalName
          : 'Configure la empresa en "Empresa y Política Contable".',
      },
      {
        key: 'CHART_OF_ACCOUNTS',
        label: 'Plan de cuentas con cuentas imputables',
        ok: movementAccounts > 0,
        required: true,
        detail:
          movementAccounts > 0
            ? `${movementAccounts} cuentas imputables activas.`
            : 'Aplique la plantilla PUC o importe su plan de cuentas.',
      },
      purposeCheck(
        'OPERATING_PURPOSES',
        'Propósitos operativos mapeados',
        required.operating,
        true,
      ),
      purposeCheck(
        'EQUITY_PURPOSES',
        'Propósitos de patrimonio y cierre mapeados',
        required.equity,
        true,
      ),
      purposeCheck(
        'TAX_PURPOSES',
        'Propósitos tributarios mapeados',
        required.tax,
        taxEngineActive,
        'No aplica: la empresa no tiene perfil tributario vigente (F6).',
      ),
      {
        key: 'OPENING_BALANCES',
        label: 'Saldos de apertura registrados',
        ok: Boolean(opening),
        required: false,
        detail: opening
          ? `Registrados con fecha ${opening.entryDate.toISOString().slice(0, 10)}.`
          : 'Recomendado si el negocio ya venía operando.',
      },
      {
        key: 'INVENTORY_RECONCILIATION',
        label: 'Inventario contable conciliado con el submayor',
        ok: inventory ? inventory.difference === '0.00' : true,
        required: false,
        detail: inventory
          ? `Diferencia entre contabilidad y submayor de valoración: $${inventory.difference}.`
          : 'Se calcula cuando el propósito de inventarios esté mapeado.',
      },
    ];
    return {
      status: checks.every((c) => !c.required || c.ok) ? 'READY' : 'INCOMPLETE',
      checks,
      template: {
        code: template.code,
        name: template.name,
        legalBasis: template.legalBasis,
        accounts: template.accounts.length,
        mappedPurposes: template.accounts.filter((a) => a.purpose).length,
      },
      inventory,
    };
  }

  /** Crea las cuentas que faltan y mapea los propósitos sin cuenta; nunca sobrescribe. */
  async applyTemplate(code: unknown, userId: string): Promise<ApplyPucTemplateResultDto> {
    const template = this.template();
    if (code !== undefined && code !== template.code) {
      throw new AccountingValidationError(`Plantilla PUC no disponible: ${String(code)}.`);
    }
    return this.repository.transaction(async (tx) => {
      const result: ApplyPucTemplateResultDto = {
        template: template.code,
        accountsCreated: [],
        accountsExisting: [],
        conflicts: [],
        purposesMapped: [],
        purposesKept: [],
      };
      const usable = new Map<string, string>();
      for (const account of template.accounts) {
        const existing = await tx.account.findUnique({ where: { code: account.code } });
        if (existing) {
          if (existing.type !== account.type) {
            result.conflicts.push({
              code: account.code,
              reason: `Ya existe con tipo ${existing.type}; la plantilla espera ${account.type}.`,
            });
          } else if (existing.allowsMovement !== account.allowsMovement) {
            result.conflicts.push({
              code: account.code,
              reason: existing.allowsMovement
                ? 'Ya existe como cuenta imputable; la plantilla la usa como agrupadora.'
                : 'Ya existe como agrupadora; la plantilla la usa como imputable.',
            });
          } else {
            result.accountsExisting.push(account.code);
            if (existing.isActive) usable.set(account.code, existing.id);
          }
          continue;
        }
        const parentCode = pucParentCode(account.code);
        const parent = parentCode
          ? await tx.account.findUnique({ where: { code: parentCode } })
          : null;
        if (parentCode && (!parent || parent.type !== account.type || parent.allowsMovement)) {
          result.conflicts.push({
            code: account.code,
            reason: `Su cuenta padre ${parentCode} no existe o no puede agruparla.`,
          });
          continue;
        }
        const created = await this.repository.createAccount(
          {
            code: account.code,
            name: account.name,
            type: account.type,
            parentId: parent?.id ?? null,
            allowsMovement: account.allowsMovement,
            isActive: true,
          },
          userId,
          tx,
        );
        result.accountsCreated.push(account.code);
        usable.set(account.code, created.id);
      }

      const today = new Date(`${businessToday()}T00:00:00.000Z`);
      for (const account of template.accounts.filter((a) => a.purpose)) {
        const purpose = account.purpose!;
        const current = await tx.companyAccountingMapping.findFirst({
          where: {
            purpose,
            status: 'ACTIVE',
            accountId: { not: null },
            effectiveFrom: { lte: today },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
          },
        });
        if (current) {
          result.purposesKept.push(purpose);
          continue;
        }
        const accountId = usable.get(account.code);
        if (!accountId) continue;
        await this.repository.setMapping(purpose, accountId, userId, tx);
        result.purposesMapped.push(purpose);
      }
      await this.repository.audit(
        tx,
        'accounting:puc_template_applied',
        'PucTemplate',
        template.code,
        userId,
        {
          accountsCreated: result.accountsCreated.length,
          purposesMapped: result.purposesMapped,
          conflicts: result.conflicts,
        } as unknown as Prisma.InputJsonValue,
      );
      return result;
    });
  }

  async getOpeningBalance(): Promise<OpeningBalanceDto | null> {
    const entry = await this.activeOpeningEntry();
    return entry ? this.toOpeningDto(entry.id) : null;
  }

  async createOpeningBalance(
    payload: CreateOpeningBalancePayload,
    userId: string,
  ): Promise<OpeningBalanceDto> {
    const entryDate = String(payload?.entryDate ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
      throw new AccountingValidationError('La fecha de corte debe tener formato YYYY-MM-DD.');
    }
    const reason = typeof payload?.reason === 'string' ? payload.reason.trim() : '';
    if (!reason || reason.length > 300) {
      throw new AccountingValidationError(
        'Indique el motivo o soporte de los saldos (máximo 300 caracteres).',
      );
    }
    if (!Array.isArray(payload?.lines) || payload.lines.length < 2) {
      throw new AccountingValidationError('Los saldos de apertura requieren al menos dos líneas.');
    }
    const lines = payload.lines.map((line, index) => {
      if (!line || typeof line.accountId !== 'string' || !UUID_RE.test(line.accountId)) {
        throw new AccountingValidationError(`La línea ${index + 1} requiere una cuenta válida.`);
      }
      const debit = String(line.debit ?? '0');
      const credit = String(line.credit ?? '0');
      if (!MONEY_RE.test(debit) || !MONEY_RE.test(credit)) {
        throw new AccountingValidationError(`La línea ${index + 1} tiene valores no válidos.`);
      }
      return {
        accountId: line.accountId,
        debit,
        credit,
        description:
          typeof line.description === 'string' ? line.description.trim().slice(0, 200) : undefined,
      };
    });
    if (await this.activeOpeningEntry()) {
      throw new AccountingConflictError(
        'Ya hay saldos de apertura vigentes. Para registrar otros, reverse primero el asiento de apertura.',
      );
    }
    const previous = await prisma.journalEntry.count({ where: { sourceType: OPENING_SOURCE } });
    const posted = await this.journal.post({
      entryDate,
      description: `Saldos de apertura: ${reason}`,
      sourceType: OPENING_SOURCE,
      sourceId: `OPENING-${previous + 1}`,
      createdById: userId,
      lines,
    });
    return this.toOpeningDto(posted.id);
  }

  /** Asiento de apertura publicado y no reversado; hay uno solo vigente. */
  private async activeOpeningEntry() {
    return prisma.journalEntry.findFirst({
      where: { sourceType: OPENING_SOURCE, status: 'POSTED', reversal: { is: null } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async toOpeningDto(id: string): Promise<OpeningBalanceDto> {
    const entry = await prisma.journalEntry.findUnique({
      where: { id },
      include: { lines: { include: { account: true } } },
    });
    if (!entry) throw new AccountingNotFoundError('Asiento de apertura inexistente.');
    const total = (side: 'debit' | 'credit') =>
      entry.lines.reduce((sum, l) => sum.plus(l[side]), new Prisma.Decimal(0));
    return {
      journalEntryId: entry.id,
      entryDate: entry.entryDate.toISOString().slice(0, 10),
      totalDebit: money(total('debit')),
      totalCredit: money(total('credit')),
      lines: entry.lines.map((l) => ({
        accountId: l.accountId,
        accountCode: l.account.code,
        accountName: l.account.name,
        debit: money(l.debit),
        credit: money(l.credit),
      })),
    };
  }

  /** Saldo de la cuenta de inventarios frente al submayor de valoración (informativo). */
  private async inventoryReconciliation(
    mappings: Awaited<ReturnType<AccountingRepository['listMappings']>>,
  ): Promise<AccountingSetupDto['inventory']> {
    const inventory = mappings.find((m) => m.purpose === 'INVENTORY' && m.status === 'ACTIVE');
    if (!inventory?.accountId) return null;
    const ledger = await prisma.journalEntryLine.aggregate({
      where: { accountId: inventory.accountId, journalEntry: { status: 'POSTED' } },
      _sum: { debit: true, credit: true },
    });
    const valuation = await prisma.inventoryCostBalance.aggregate({ _sum: { totalValue: true } });
    const ledgerBalance = (ledger._sum.debit ?? new Prisma.Decimal(0)).minus(
      ledger._sum.credit ?? new Prisma.Decimal(0),
    );
    const valuationBalance = valuation._sum.totalValue ?? new Prisma.Decimal(0);
    return {
      ledgerBalance: money(ledgerBalance),
      valuationBalance: money(valuationBalance),
      difference: money(ledgerBalance.minus(valuationBalance)),
    };
  }
}
