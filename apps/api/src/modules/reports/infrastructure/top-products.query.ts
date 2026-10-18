import { Prisma, PrismaClient } from '@farmacia/database';
import { TopProductsSortBy } from '@farmacia/contracts';

interface TopProductRow {
  productId: string;
  productCode: string;
  productName: string;
  baseUnit: string;
  soldBaseUnits: bigint;
  returnedBaseUnits: bigint;
  netBaseUnits: bigint;
  soldValue: string;
  returnedValue: string;
  netValue: string;
  salesCount: bigint;
}

export function queryTopProducts(
  prisma: PrismaClient,
  from: Date | undefined,
  to: Date | undefined,
  sortBy: TopProductsSortBy,
  limit: number,
): Promise<TopProductRow[]> {
  // Principal desc, secundario desc y código asc: desempate estable antes del límite.
  const order =
    sortBy === 'value'
      ? Prisma.sql`net_value DESC, net_units DESC, p.code ASC`
      : Prisma.sql`net_units DESC, net_value DESC, p.code ASC`;
  return prisma.$queryRaw<TopProductRow[]>(Prisma.sql`
    WITH sold AS (
      SELECT l.product_id, SUM(l.quantity_base_units) AS units,
             SUM(l.total) AS value, COUNT(DISTINCT l.sale_id) AS sales_count
      FROM sale_lines l JOIN sales s ON s.id = l.sale_id
      WHERE s.status <> 'CANCELLED'
        ${from ? Prisma.sql`AND s.created_at >= ${from}` : Prisma.empty}
        ${to ? Prisma.sql`AND s.created_at <= ${to}` : Prisma.empty}
      GROUP BY l.product_id
      HAVING SUM(l.quantity_base_units) > 0
    ), returned AS (
      SELECT l.product_id, SUM(l.quantity_base_units) AS units, SUM(l.total) AS value
      FROM credit_note_lines l JOIN credit_notes n ON n.id = l.credit_note_id
      WHERE TRUE
        ${from ? Prisma.sql`AND n.created_at >= ${from}` : Prisma.empty}
        ${to ? Prisma.sql`AND n.created_at <= ${to}` : Prisma.empty}
      GROUP BY l.product_id
    ), net AS (
      SELECT sold.*, COALESCE(r.units, 0) AS returned_units,
             COALESCE(r.value, 0) AS returned_value,
             sold.units - COALESCE(r.units, 0) AS net_units,
             sold.value - COALESCE(r.value, 0) AS net_value
      FROM sold LEFT JOIN returned r USING (product_id)
    )
    SELECT p.id AS "productId", p.code AS "productCode", p.name AS "productName",
           p.base_unit AS "baseUnit", net.units AS "soldBaseUnits",
           net.returned_units AS "returnedBaseUnits", net.net_units AS "netBaseUnits",
           net.value::text AS "soldValue", net.returned_value::text AS "returnedValue",
           net.net_value::text AS "netValue", net.sales_count AS "salesCount"
    FROM net JOIN products p ON p.id = net.product_id
    ORDER BY ${order}
    LIMIT ${limit}
  `);
}
