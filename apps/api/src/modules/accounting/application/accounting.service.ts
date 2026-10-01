import { Injectable } from '@nestjs/common';
import { Prisma } from '@farmacia/database';
import {
  AccountInput,
  AccountDto,
  AccountingPurpose,
  AccountImportPreviewDto,
  AccountImportRowDto,
  ACCOUNT_TYPES,
  ACCOUNTING_PURPOSES,
} from '@farmacia/contracts';
import { AccountingRepository } from '../infrastructure/accounting.repository';
import {
  AccountingConflictError,
  AccountingValidationError,
  validateAccountFields,
  validatePurpose,
} from '../domain/accounting-rules';
import {
  accountTemplate,
  parseAccountWorkbook,
  previewDto,
} from '../infrastructure/excel-account-import';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class AccountingService {
  constructor(private readonly repository: AccountingRepository) {}

  listAccounts(): Promise<AccountDto[]> {
    return this.repository.listAccounts();
  }
  listMappings() {
    return this.repository.listMappings();
  }
  configurationStatus() {
    return this.repository.configurationStatus();
  }
  resolveAccountByPurpose(purpose: AccountingPurpose, date?: Date) {
    return this.repository.resolveAccountByPurpose(purpose, date);
  }
  template() {
    return accountTemplate();
  }

  createAccount(raw: AccountInput, userId: string) {
    validateAccountFields(raw);
    if (
      raw.parentId !== undefined &&
      raw.parentId !== null &&
      (typeof raw.parentId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw.parentId))
    )
      throw new AccountingValidationError('Cuenta padre inválida.');
    const input: AccountInput = {
      code: raw.code.trim(),
      name: raw.name.trim(),
      type: raw.type,
      parentId: raw.parentId ?? null,
      allowsMovement: raw.allowsMovement,
      isActive: raw.isActive ?? true,
    };
    return this.repository.transaction((tx) => this.repository.createAccount(input, userId, tx));
  }

  updateAccount(id: string, raw: Partial<AccountInput>, userId: string) {
    if (!UUID_RE.test(id)) throw new AccountingValidationError('ID de cuenta inválido.');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new AccountingValidationError('Datos de cuenta inválidos.');
    if (
      raw.code !== undefined &&
      (typeof raw.code !== 'string' || !/^[0-9A-Za-z.-]{1,32}$/.test(raw.code.trim()))
    )
      throw new AccountingValidationError('Código inválido.');
    if (
      raw.name !== undefined &&
      (typeof raw.name !== 'string' || !raw.name.trim() || raw.name.trim().length > 255)
    )
      throw new AccountingValidationError('Nombre inválido.');
    if (raw.type !== undefined && !ACCOUNT_TYPES.includes(raw.type))
      throw new AccountingValidationError('Tipo inválido.');
    if (raw.allowsMovement !== undefined && typeof raw.allowsMovement !== 'boolean')
      throw new AccountingValidationError('Permite Movimiento inválido.');
    if (raw.isActive !== undefined && typeof raw.isActive !== 'boolean')
      throw new AccountingValidationError('Estado inválido.');
    if (
      raw.parentId !== undefined &&
      raw.parentId !== null &&
      (typeof raw.parentId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw.parentId))
    )
      throw new AccountingValidationError('Cuenta padre inválida.');
    const input: Partial<AccountInput> = { ...raw };
    if (raw.code !== undefined) input.code = raw.code.trim();
    if (raw.name !== undefined) input.name = raw.name.trim();
    return this.repository.transaction((tx) =>
      this.repository.updateAccount(id, input, userId, tx),
    );
  }

  mapPurpose(purpose: string, accountId: string | null, userId: string) {
    const validated = validatePurpose(purpose);
    if (accountId !== null && (typeof accountId !== 'string' || !UUID_RE.test(accountId)))
      throw new AccountingValidationError('Cuenta inválida.');
    return this.repository.transaction((tx) =>
      this.repository.setMapping(validated, accountId, userId, tx),
    );
  }

  private validateRows(
    rows: AccountImportRowDto[],
    existing: AccountDto[],
    activePurposes: ReadonlySet<string>,
  ): AccountImportRowDto[] {
    const byCode = new Map(existing.map((account) => [account.code, account]));
    const fileCodes = new Map<string, AccountImportRowDto>();
    const filePurposes = new Set<string>();
    for (const row of rows) {
      if (fileCodes.has(row.code)) row.errors.push('Código duplicado dentro del archivo.');
      else fileCodes.set(row.code, row);
      if (byCode.has(row.code)) row.errors.push('Código ya existe en el plan de cuentas.');
      if (row.purpose) {
        if (filePurposes.has(row.purpose))
          row.errors.push('Propósito duplicado dentro del archivo.');
        if (activePurposes.has(row.purpose))
          row.errors.push('El propósito ya está asignado; cambie el mapeo explícitamente.');
        filePurposes.add(row.purpose);
        if (!row.allowsMovement || !row.isActive)
          row.errors.push('El propósito requiere una cuenta activa e imputable.');
      }
    }
    const visit = (row: AccountImportRowDto, visiting: Set<string>): void => {
      if (!row.parentCode) return;
      const parent = fileCodes.get(row.parentCode) ?? byCode.get(row.parentCode);
      if (!parent) {
        row.errors.push('Cuenta padre inexistente.');
        return;
      }
      if (row.parentCode === row.code || visiting.has(row.parentCode)) {
        row.errors.push('Ciclo en la jerarquía.');
        return;
      }
      if (parent.type !== row.type) row.errors.push('Tipo distinto al de la cuenta padre.');
      if (parent.allowsMovement) row.errors.push('La cuenta padre permite movimiento.');
      if (!parent.isActive) row.errors.push('La cuenta padre está inactiva.');
      if (!row.code.startsWith(parent.code)) row.errors.push('Código incompatible con el padre.');
      const fileParent = fileCodes.get(row.parentCode);
      if (fileParent) {
        const next = new Set(visiting);
        next.add(row.code);
        visit(fileParent, next);
      }
    };
    for (const row of rows) visit(row, new Set());
    return rows;
  }

  async preview(buffer: Buffer): Promise<AccountImportPreviewDto> {
    const parsed = await parseAccountWorkbook(buffer);
    const mappings = await this.repository.listMappings();
    const activePurposes = new Set(
      mappings.filter((item) => item.status === 'ACTIVE').map((item) => item.purpose),
    );
    return previewDto(
      parsed.hash,
      this.validateRows(parsed.rows, await this.repository.listAccounts(), activePurposes),
    );
  }

  async confirm(
    buffer: Buffer,
    previewHash: string,
    userId: string,
  ): Promise<{ importedCount: number }> {
    const parsed = await parseAccountWorkbook(buffer);
    if (!/^[a-f0-9]{64}$/.test(previewHash) || parsed.hash !== previewHash)
      throw new AccountingConflictError('El archivo no coincide con la vista previa.');
    return this.repository.transaction(async (tx) => {
      const existing = (await tx.account.findMany()).map((account) => ({
        ...account,
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString(),
      }));
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const mappings = await tx.companyAccountingMapping.findMany({
        where: {
          status: 'ACTIVE',
          effectiveFrom: { lte: today },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
        },
      });
      const rows = this.validateRows(
        parsed.rows,
        existing,
        new Set(mappings.map((item) => item.purpose)),
      );
      if (rows.some((row) => row.errors.length))
        throw new AccountingValidationError(
          'El archivo contiene errores; vuelva a generar la vista previa.',
        );
      const remaining = new Map(rows.map((row) => [row.code, row]));
      const ids = new Map(existing.map((account) => [account.code, account.id]));
      while (remaining.size) {
        let progressed = false;
        for (const [code, row] of remaining) {
          if (row.parentCode && !ids.has(row.parentCode)) continue;
          const account = await this.repository.createAccount(
            {
              code,
              name: row.name,
              type: row.type as (typeof ACCOUNT_TYPES)[number],
              parentId: row.parentCode ? ids.get(row.parentCode)! : null,
              allowsMovement: row.allowsMovement!,
              isActive: row.isActive!,
            },
            userId,
            tx,
          );
          ids.set(code, account.id);
          remaining.delete(code);
          progressed = true;
          if (row.purpose)
            await this.repository.setMapping(
              row.purpose as (typeof ACCOUNTING_PURPOSES)[number],
              account.id,
              userId,
              tx,
            );
        }
        if (!progressed) throw new AccountingValidationError('Jerarquía inválida en el archivo.');
      }
      await this.repository.audit(
        tx,
        'accounting:accounts_imported',
        'AccountImport',
        parsed.hash,
        userId,
        { count: rows.length, sha256: parsed.hash } as Prisma.InputJsonValue,
      );
      return { importedCount: rows.length };
    });
  }
}
