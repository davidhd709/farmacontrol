import { describe, expect, it } from 'vitest';
import { formatValueForCsv, generateCsv } from '../../src/modules/reports/utils/csv-exporter.util';

describe('Exportación CSV', () => {
  it('neutraliza celdas que una hoja de cálculo ejecutaría como fórmula', () => {
    expect(formatValueForCsv('=HYPERLINK("http://x","clic")')).toBe(
      `"'=HYPERLINK(""http://x"",""clic"")"`,
    );
    expect(formatValueForCsv('+57 300')).toBe("'+57 300");
    expect(formatValueForCsv('-1+1')).toBe("'-1+1");
    expect(formatValueForCsv('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(formatValueForCsv('\t=1')).toBe("'\t=1");
  });

  it('no altera números ni texto normal', () => {
    expect(formatValueForCsv(-500)).toBe('-500');
    expect(formatValueForCsv('-500.00')).toBe('-500.00');
    expect(formatValueForCsv('1250.50')).toBe('1250.50');
    expect(formatValueForCsv('Acetaminofén 500 mg')).toBe('Acetaminofén 500 mg');
    expect(formatValueForCsv('Pérez, Ana')).toBe('"Pérez, Ana"');
    expect(formatValueForCsv(null)).toBe('');
  });

  it('aplica la protección a cada celda del archivo', () => {
    const csv = generateCsv([{ header: 'Cliente', accessor: (r: { name: string }) => r.name }], [
      { name: '=cmd|"/C calc"!A0' },
    ]);
    expect(csv.split('\r\n')[1]).toBe(`"'=cmd|""/C calc""!A0"`);
  });
});
