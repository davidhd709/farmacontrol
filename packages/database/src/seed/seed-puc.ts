import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import { prisma, AccountType, AccountingPurpose } from '../index';

const PHARMACY_DEFAULT_PURPOSES: Record<string, AccountingPurpose> = {
  '11050501': 'CASH', // Caja general
  '11200501': 'BANK', // Bancolombia Cta Aho 68095832443
  '13050501': 'CUSTOMERS', // Deudores nacionales
  '220501': 'SUPPLIERS', // Proveedores nacionales
  '1435': 'INVENTORY', // Mercancías no fabricadas por la empresa
  '413538': 'SALES_TAXED', // Venta productos farmacéuticos y medicinales
  '413595': 'SALES_EXCLUDED', // Venta de otros productos
  '613538': 'COST_OF_SALES', // Costo de ventas farmacéuticos
  '24080101': 'VAT_OUTPUT', // IVA generado ventas 19%
  '24080201': 'VAT_INPUT', // IVA compras 19%
  '13551801': 'SIMPLE_TAX_ADVANCE', // Retención ICA / Anticipo impuestos
  '417507': 'SALES_RETURNS', // Devoluciones en ventas
  '417506': 'SALES_DISCOUNTS', // Descuentos condicionados
  '3130': 'CAPITAL', // Capital de personas naturales
  '360505': 'CURRENT_YEAR_RESULT', // Utilidad del ejercicio
};

function inferAccountType(code: string): AccountType {
  const first = code.trim().charAt(0);
  switch (first) {
    case '1': return 'ASSET';
    case '2': return 'LIABILITY';
    case '3': return 'EQUITY';
    case '4': return 'INCOME';
    case '5': return 'EXPENSE';
    case '6':
    case '7': return 'COST';
    case '8': return 'ORDER_DEBTOR';
    case '9': return 'ORDER_CREDITOR';
    default: return 'ASSET';
  }
}

function findCanonicalParent(code: string, allCodes: Set<string>): string | null {
  for (let len = code.length - 1; len >= 1; len--) {
    const candidate = code.slice(0, len);
    if (allCodes.has(candidate)) return candidate;
  }
  return null;
}

export async function seedPuc(filePath?: string) {
  let targetPath = filePath;
  if (!targetPath) {
    const candidates = [
      path.resolve(process.cwd(), 'docs/PUC.xlsx'),
      path.resolve(process.cwd(), '../../docs/PUC.xlsx'),
      path.resolve(__dirname, '../../../../docs/PUC.xlsx'),
    ];
    targetPath = candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
  }
  console.log(`[Seed PUC] Leyendo archivo PUC desde: ${targetPath}`);

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Archivo PUC no encontrado en ${targetPath}`);
  }

  const buffer = fs.readFileSync(targetPath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('El archivo Excel no contiene hojas.');

  const rawHeaders: string[] = [];
  sheet.getRow(1).eachCell((cell) => {
    rawHeaders.push(String(cell.value ?? '').trim().toLowerCase());
  });

  const getCell = (row: ExcelJS.Row, index: number): string => {
    const val = row.getCell(index + 1).value;
    if (val === null || val === undefined) return '';
    if (typeof val === 'object' && 'text' in val) return String(val.text).trim();
    return String(val).trim();
  };

  interface RawAccount {
    code: string;
    name: string;
    parentCodeRaw: string | null;
  }

  const rawAccounts: RawAccount[] = [];
  for (let n = 2; n <= sheet.rowCount; n++) {
    const row = sheet.getRow(n);
    if (!row.hasValues) continue;
    const code = getCell(row, 0);
    const name = getCell(row, 1);
    const parentCodeRaw = getCell(row, 2) || null;
    if (!code || !name) continue;
    rawAccounts.push({
      code,
      name,
      parentCodeRaw: parentCodeRaw?.trim() ? parentCodeRaw.trim() : null,
    });
  }

  console.log(`[Seed PUC] Filas válidas detectadas en Excel: ${rawAccounts.length}`);
  const allCodes = new Set(rawAccounts.map((a) => a.code));

  // Resolver jerarquía canónica
  const resolvedParents = new Map<string, string | null>();
  for (const acc of rawAccounts) {
    if (acc.code.length === 1) {
      resolvedParents.set(acc.code, null);
    } else if (
      acc.parentCodeRaw &&
      allCodes.has(acc.parentCodeRaw) &&
      acc.code.startsWith(acc.parentCodeRaw)
    ) {
      resolvedParents.set(acc.code, acc.parentCodeRaw);
    } else {
      resolvedParents.set(acc.code, findCanonicalParent(acc.code, allCodes));
    }
  }

  const usedAsParent = new Set<string>();
  for (const parent of resolvedParents.values()) {
    if (parent) usedAsParent.add(parent);
  }

  // Pre-asignar UUIDs y niveles
  const idMap = new Map<string, string>();
  const levelMap = new Map<string, number>();

  // Cargar cuentas ya existentes en base de datos si las hubiera
  const existingAccounts = await prisma.account.findMany({ select: { id: true, code: true, level: true } });
  for (const ex of existingAccounts) {
    idMap.set(ex.code, ex.id);
    levelMap.set(ex.code, ex.level);
  }

  const pending = rawAccounts.filter((a) => !idMap.has(a.code));
  console.log(`[Seed PUC] Cuentas a insertar: ${pending.length} (existentes: ${existingAccounts.length})`);

  if (pending.length > 0) {
    const remaining = new Map(pending.map((a) => [a.code, a]));
    let insertedTotal = 0;

    while (remaining.size > 0) {
      const batch: Array<{
        id: string;
        code: string;
        name: string;
        type: AccountType;
        parentId: string | null;
        level: number;
        allowsMovement: boolean;
        isActive: boolean;
      }> = [];

      for (const [code, acc] of remaining) {
        const parentCode = resolvedParents.get(code) ?? null;
        if (parentCode && !idMap.has(parentCode)) continue;

        const id = crypto.randomUUID();
        idMap.set(code, id);
        const parentId = parentCode ? idMap.get(parentCode)! : null;
        const level = parentCode ? (levelMap.get(parentCode) ?? 0) + 1 : 1;
        levelMap.set(code, level);

        const allowsMovement = !usedAsParent.has(code);
        const type = inferAccountType(code);

        batch.push({
          id,
          code,
          name: acc.name,
          type,
          parentId,
          level,
          allowsMovement,
          isActive: true,
        });
      }

      if (batch.length === 0) {
        throw new Error('Inconsistencia jerárquica en las cuentas pendientes.');
      }

      await prisma.account.createMany({ data: batch });
      insertedTotal += batch.length;

      for (const b of batch) {
        remaining.delete(b.code);
      }
      console.log(`[Seed PUC] Insertado lote de nivel: ${batch.length} cuentas (total insertado: ${insertedTotal})`);
    }
  }

  // Configurar los propósitos contables de la farmacia
  console.log('[Seed PUC] Configurando mapeos de propósitos contables...');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  // Buscar un usuario administrador para registrar los mapeos
  const adminUser = await prisma.user.findFirst({
    where: { userRoles: { some: { role: { name: 'ADMINISTRATOR' } } } },
    select: { id: true },
  });

  const adminId = adminUser?.id ?? null;
  let mappedCount = 0;

  for (const [code, purpose] of Object.entries(PHARMACY_DEFAULT_PURPOSES)) {
    const accountId = idMap.get(code);
    if (!accountId) {
      console.warn(`[Seed PUC] Cuenta ${code} para propósito ${purpose} no encontrada.`);
      continue;
    }

    const currentMapping = await prisma.companyAccountingMapping.findFirst({
      where: {
        purpose,
        effectiveFrom: { lte: today },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (currentMapping) {
      await prisma.companyAccountingMapping.update({
        where: { id: currentMapping.id },
        data: { accountId, status: 'ACTIVE', updatedById: adminId },
      });
    } else {
      await prisma.companyAccountingMapping.create({
        data: {
          purpose,
          accountId,
          status: 'ACTIVE',
          effectiveFrom: today,
          updatedById: adminId,
        },
      });
    }
    mappedCount++;
  }

  console.log(`[Seed PUC] ¡Éxito! ${mappedCount} propósitos contables enlazados.`);
  const totalInDb = await prisma.account.count();
  console.log(`[Seed PUC] Total de cuentas en base de datos: ${totalInDb}`);
  return { totalInDb, mappedCount };
}

// Ejecución CLI directa
if (require.main === module) {
  seedPuc()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error('[Seed PUC ERROR]', err);
      prisma.$disconnect().then(() => process.exit(1));
    });
}
