import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import { Workbook, SpreadsheetFile, FileBlob } from '@oai/artifact-tool';

const output = 'docs/PUC_FARMACIA_PROPUESTA.xlsx';
const selected = [
  ['1', 'Activo'],
  ['11', 'Disponible'],
  ['1105', 'Caja'],
  ['110505', 'Caja general'],
  ['1110', 'Bancos'],
  ['111005', 'Moneda nacional'],
  ['1120', 'Cuentas de ahorro'],
  ['112005', 'Bancos'],
  ['13', 'Deudores'],
  ['1305', 'Clientes'],
  ['130505', 'Nacionales'],
  ['14', 'Inventarios'],
  ['1435', 'Mercancías no fabricadas por la empresa'],
  ['2', 'Pasivo'],
  ['22', 'Proveedores'],
  ['2205', 'Nacionales'],
  ['23', 'Cuentas por pagar'],
  ['2335', 'Costos y gastos por pagar'],
  ['233540', 'Arrendamientos'],
  ['233550', 'Servicios públicos'],
  ['24', 'Impuestos, gravámenes y tasas'],
  ['2408', 'Impuesto sobre las ventas por pagar'],
  ['25', 'Obligaciones laborales'],
  ['2505', 'Salarios por pagar'],
  ['3', 'Patrimonio'],
  ['31', 'Capital social'],
  ['3130', 'Capital de personas naturales'],
  ['36', 'Resultados del ejercicio'],
  ['3605', 'Utilidad del ejercicio'],
  ['3610', 'Pérdida del ejercicio'],
  ['37', 'Resultados de ejercicios anteriores'],
  ['3705', 'Utilidades acumuladas'],
  ['3710', 'Pérdidas acumuladas'],
  ['4', 'Ingresos'],
  ['41', 'Operacionales'],
  ['4135', 'Comercio al por mayor y al por menor'],
  ['413538', 'Venta de productos de aseo, farmacéuticos, medicinales, y artículos de tocador'],
  ['4175', 'Devoluciones en ventas (DB)'],
  ['42', 'No operacionales'],
  ['4210', 'Financieros'],
  ['421040', 'Descuentos comerciales condicionados'],
  ['5', 'Gastos'],
  ['51', 'Operacionales de administración'],
  ['5105', 'Gastos de personal'],
  ['510506', 'Sueldos'],
  ['510530', 'Cesantías'],
  ['5120', 'Arrendamientos'],
  ['512010', 'Construcciones y edificaciones'],
  ['5135', 'Servicios'],
  ['513525', 'Acueducto y alcantarillado'],
  ['513530', 'Energía eléctrica'],
  ['513535', 'Teléfono'],
  ['5145', 'Mantenimiento y reparaciones'],
  ['514515', 'Maquinaria y equipo'],
  ['5195', 'Diversos'],
  ['519525', 'Elementos de aseo y cafetería'],
  ['52', 'Operacionales de ventas'],
  ['5205', 'Gastos de personal'],
  ['520506', 'Sueldos'],
  ['6', 'Costos de ventas'],
  ['61', 'Costo de ventas y de prestación de servicios'],
  ['6135', 'Comercio al por mayor y al por menor'],
  ['613538', 'Venta de productos de aseo, farmacéuticos, medicinales y artículos de tocador'],
];
const accountType = {
  1: 'ASSET',
  2: 'LIABILITY',
  3: 'EQUITY',
  4: 'INCOME',
  5: 'EXPENSE',
  6: 'COST',
};
const selectedCodes = new Set(selected.map(([code]) => code));
if (selectedCodes.size !== selected.length) throw new Error('Duplicate code');
const rows = selected.map(([code, name]) => {
  const parent =
    code.length === 1 ? '' : code.slice(0, code.length === 2 ? 1 : code.length === 4 ? 2 : 4);
  if (parent && !selectedCodes.has(parent))
    throw new Error('Missing parent ' + parent + ' for ' + code);
  const hasChild = selected.some(([candidate]) => candidate !== code && candidate.startsWith(code));
  return [
    code,
    name,
    accountType[code[0]],
    parent,
    hasChild ? 'NO' : 'SÍ',
    hasChild ? 'SÍ' : 'NO',
    '',
  ];
});
if (rows.some((row) => row[3] && rows.find((candidate) => candidate[0] === row[3])?.[5] !== 'SÍ'))
  throw new Error('Inactive parent');

const workbook = Workbook.create();
const sheet = workbook.worksheets.add('Plan de cuentas');
sheet.showGridLines = false;
sheet.getRange('A1:G1').values = [
  [
    'Código',
    'Nombre',
    'Tipo',
    'Código Padre',
    'Permite Movimiento',
    'Estado',
    'Propósito Contable',
  ],
];
sheet.getRangeByIndexes(1, 0, rows.length, 7).values = rows;
sheet.getRange('A1:G' + (rows.length + 1)).format.font = {
  name: 'Arial',
  size: 10,
  color: '#1F2937',
};
sheet.getRange('A1:G1').format.fill = '#17324D';
sheet.getRange('A1:G1').format.font = { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' };
sheet.getRange('A1:G1').format.rowHeight = 28;
sheet.getRange('A1:G1').format.verticalAlignment = 'center';
sheet.getRange('A1:G1').format.horizontalAlignment = 'center';
sheet.getRange('A1:A' + (rows.length + 1)).setNumberFormat('@');
sheet.getRange('D1:D' + (rows.length + 1)).setNumberFormat('@');
for (const [column, width] of [
  ['A', 15],
  ['B', 82],
  ['C', 18],
  ['D', 18],
  ['E', 24],
  ['F', 14],
  ['G', 24],
]) {
  sheet.getRange(column + ':' + column).format.columnWidth = width;
}
sheet.freezePanes.freezeRows(1);

const review = workbook.worksheets.add('Revisión contadora');
review.showGridLines = false;
review.getRange('A1').values = [['Cuentas PUC útiles para la farmacia']];
review.getRange('A1').format.font = { name: 'Arial', size: 14, bold: true, color: '#17324D' };
review.getRange('A3:B5').values = [
  ['Estado', 'Propuesta de referencia. No se asignan propósitos ni se activan cuentas imputables.'],
  ['Fuente', 'https://puc.com.co/cuentas/ (clases 1 a 6; consulta 2026-09-30)'],
  [
    'Uso',
    'Revisar con la contadora antes de confirmar la importación o mapear cuentas operativas.',
  ],
];
review.getRange('A7:D7').values = [
  ['Código', 'Nombre en puc.com.co', 'Uso mencionado previamente', 'Acción'],
];
review.getRange('A8:D11').values = [
  [
    '135518',
    'Impuesto de industria y comercio retenido',
    'Anticipo impuesto SIMPLE',
    'Validar código y denominación',
  ],
  ['413595', 'Venta de otros productos', 'Descuentos comerciales', 'Validar código y denominación'],
  ['421005', 'Intereses', 'Descuentos financieros obtenidos', 'Validar código y denominación'],
  [
    '417505',
    'No aparece en el listado de subcuentas 4175',
    'Devoluciones en ventas',
    'Validar si es subcuenta propia',
  ],
];
review.getRange('A7:D7').format.fill = '#17324D';
review.getRange('A7:D7').format.font = { name: 'Arial', size: 10, bold: true, color: '#FFFFFF' };
review.getRange('A3:D11').format.font = { name: 'Arial', size: 10, color: '#1F2937' };
for (const [column, width] of [
  ['A', 17],
  ['B', 58],
  ['C', 38],
  ['D', 35],
]) {
  review.getRange(column + ':' + column).format.columnWidth = width;
}
review.getRange('A8:D11').format.rowHeight = 24;
workbook.recalculate();
const mainCheck = await workbook.inspect({
  kind: 'region',
  sheetId: sheet.sheetId,
  range: 'A1:G12',
  maxChars: 2600,
});
const reviewCheck = await workbook.inspect({
  kind: 'region',
  sheetId: review.sheetId,
  range: 'A7:D11',
  maxChars: 1800,
});
console.log('selectedAccounts=' + rows.length);
console.log(mainCheck.ndjson);
console.log(reviewCheck.ndjson);
const preview = await workbook.render({
  sheetName: 'Plan de cuentas',
  range: 'A1:G16',
  scale: 1.2,
  format: 'png',
});
await fs.writeFile('/tmp/puc-farmacia-preview.png', new Uint8Array(await preview.arrayBuffer()));
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(output);
console.log('output=' + output);
// El exportador Artifact Tool no es compatible con el ExcelJS del importador.
// Su workbook.xml con prefijo x: no se parsea; reexportar con ExcelJS.
const require = createRequire(import.meta.url);
const ExcelJS = require('../apps/api/node_modules/exceljs');
const compatible = new ExcelJS.Workbook();
const importSheet = compatible.addWorksheet('Plan de cuentas', {
  views: [{ state: 'frozen', ySplit: 1 }],
});
importSheet.addRow([
  'Código',
  'Nombre',
  'Tipo',
  'Código Padre',
  'Permite Movimiento',
  'Estado',
  'Propósito Contable',
]);
for (const row of rows) importSheet.addRow(row);
importSheet.columns = [15, 82, 18, 18, 24, 14, 24].map((width) => ({ width }));
importSheet.getRow(1).height = 28;
importSheet.getRow(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
importSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17324D' } };
importSheet.getColumn(1).numFmt = '@';
importSheet.getColumn(4).numFmt = '@';
const noteSheet = compatible.addWorksheet('Revisión contadora');
noteSheet.addRow(['Cuentas PUC útiles para la farmacia']);
noteSheet.addRow([]);
noteSheet.addRow([
  'Estado',
  'Propuesta de referencia. No se asignan propósitos ni se activan cuentas imputables.',
]);
noteSheet.addRow(['Fuente', 'https://puc.com.co/cuentas/ (clases 1 a 6; consulta 2026-09-30)']);
noteSheet.addRow([
  'Uso',
  'Revisar con la contadora antes de confirmar la importación o mapear cuentas operativas.',
]);
noteSheet.addRow([]);
noteSheet.addRow(['Código', 'Nombre en puc.com.co', 'Uso mencionado previamente', 'Acción']);
noteSheet.addRows([
  [
    '135518',
    'Impuesto de industria y comercio retenido',
    'Anticipo impuesto SIMPLE',
    'Validar código y denominación',
  ],
  ['413595', 'Venta de otros productos', 'Descuentos comerciales', 'Validar código y denominación'],
  ['421005', 'Intereses', 'Descuentos financieros obtenidos', 'Validar código y denominación'],
  [
    '417505',
    'No aparece en el listado de subcuentas 4175',
    'Devoluciones en ventas',
    'Validar si es subcuenta propia',
  ],
]);
noteSheet.columns = [17, 58, 38, 35].map((width) => ({ width }));
await compatible.xlsx.writeFile(output);
const finalWorkbook = await SpreadsheetFile.importXlsx(await FileBlob.load(output));
for (const [name, path, range] of [
  ['Plan de cuentas', '/tmp/puc-farmacia-final-plan.png', 'A1:G16'],
  ['Revisión contadora', '/tmp/puc-farmacia-final-revision.png', 'A1:D11'],
]) {
  const rendered = await finalWorkbook.render({
    sheetName: name,
    range,
    scale: 1.2,
    format: 'png',
  });
  await fs.writeFile(path, new Uint8Array(await rendered.arrayBuffer()));
}
