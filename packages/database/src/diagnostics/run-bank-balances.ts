import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { Client } from 'pg';
import {
  buildBankBalanceReport,
  renderBankBalanceCsv,
  renderBankBalanceMarkdown,
} from './bank-balances';

const USAGE = `Diagnóstico de saldos bancarios (SOLO LECTURA, contra una COPIA de la base del cliente).

  DIAGNOSTIC_DATABASE_URL=postgresql://... pnpm db:diagnose:banks --copia [--formato md|csv] [--salida RUTA]

  --copia          obligatorio: confirma que la URL apunta a una copia, no a producción
  --formato        md (por defecto) o csv
  --salida         md: archivo (por defecto, la consola); csv: carpeta (por defecto ./diagnostico-bancos)
  --url            alternativa a DIAGNOSTIC_DATABASE_URL

No lee DATABASE_URL ni el .env de la aplicación, para no apuntar por accidente a la base en uso.`;

/** Nombre de la base sin credenciales ni host (no se importa ../client: carga el .env). */
function databaseName(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, '') || 'desconocida';
  } catch {
    return 'desconocida';
  }
}

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
    return;
  }
  const url = argValue(args, '--url') ?? process.env.DIAGNOSTIC_DATABASE_URL;
  const format = argValue(args, '--formato') ?? 'md';
  const output = argValue(args, '--salida');

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'NODE_ENV=production: este diagnóstico solo se ejecuta contra una copia de la base.',
    );
  }
  if (!url) throw new Error(`Falta la URL de la copia.\n\n${USAGE}`);
  if (!args.includes('--copia')) {
    throw new Error(`Confirme con --copia que ${databaseName(url)} es una copia y no producción.`);
  }
  if (format !== 'md' && format !== 'csv') throw new Error('--formato debe ser md o csv.');

  // Toda la sesión es de solo lectura; el reporte además abre su transacción READ ONLY
  const client = new Client({
    connectionString: url,
    application_name: 'farmacontrol-diagnostico-bancos',
    options: '-c default_transaction_read_only=on -c statement_timeout=120000',
  });
  await client.connect();
  try {
    const report = await buildBankBalanceReport(client);
    if (report.transactionReadOnly !== 'on') {
      throw new Error('La sesión no quedó en solo lectura; no se genera el reporte.');
    }
    if (format === 'md') {
      const markdown = renderBankBalanceMarkdown(report);
      if (output) {
        writeFileSync(resolve(output), markdown);
        console.error(`Reporte de ${report.databaseName} escrito en ${resolve(output)}`);
      } else {
        console.log(markdown);
      }
    } else {
      const dir = resolve(output ?? 'diagnostico-bancos');
      mkdirSync(dir, { recursive: true });
      for (const [name, content] of Object.entries(renderBankBalanceCsv(report))) {
        writeFileSync(join(dir, name), content);
      }
      console.error(`Reporte de ${report.databaseName} escrito en ${dir}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
