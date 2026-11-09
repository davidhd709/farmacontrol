import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SaleQueryValidationPipe } from '../../src/modules/sales/presentation/dtos/sale-query.dto';
import { PrismaSaleRepository } from '../../src/modules/sales/infrastructure/prisma-sale.repository';
import type { PrismaClient } from '@farmacia/database';

describe('Sale Search & Pagination (REQ-005 Backend Unit)', () => {
  describe('SaleQueryValidationPipe', () => {
    const pipe = new SaleQueryValidationPipe();

    it('procesa y recorta el parámetro de búsqueda general "search"', () => {
      const result = pipe.transform({ search: '  FAC-000001  ' }, {} as any);
      expect(result.search).toBe('FAC-000001');
    });

    it('ignora search si está vacío o solo contiene espacios', () => {
      const result = pipe.transform({ search: '   ' }, {} as any);
      expect(result.search).toBeUndefined();
    });

    it('mantiene otros filtros junto con search', () => {
      const result = pipe.transform(
        {
          search: 'María Rodríguez',
          status: 'COMPLETED',
          page: '2',
          limit: '20',
        },
        {} as any,
      );

      expect(result.search).toBe('María Rodríguez');
      expect(result.status).toBe('COMPLETED');
      expect(result.page).toBe(2);
      expect(result.limit).toBe(20);
    });
  });

  describe('PrismaSaleRepository.findAll (Multi-criteria search & Pagination)', () => {
    let mockPrisma: {
      sale: {
        findMany: ReturnType<typeof vi.fn>;
        count: ReturnType<typeof vi.fn>;
      };
    };
    let repository: PrismaSaleRepository;

    const sampleRawSale = {
      id: 'sale-1',
      invoiceNumber: 'FAC-000001',
      customerId: 'cust-1',
      status: 'COMPLETED',
      paymentMethod: 'EFECTIVO',
      bankAccountId: null,
      subtotal: 10000,
      taxTotal: 1900,
      incTotal: 0,
      discountTotal: 0,
      total: 11900,
      amountPaid: 11900,
      changeGiven: 0,
      notes: null,
      createdById: 'usr-1',
      createdAt: new Date('2026-10-01T10:00:00Z'),
      updatedAt: new Date('2026-10-01T10:00:00Z'),
      customer: {
        id: 'cust-1',
        name: 'María Rodríguez',
        documentNumber: '1017001002',
      },
      createdByUser: {
        id: 'usr-1',
        username: 'admin',
      },
      lines: [],
    };

    beforeEach(() => {
      mockPrisma = {
        sale: {
          findMany: vi.fn().mockResolvedValue([sampleRawSale]),
          count: vi.fn().mockResolvedValue(1),
        },
      };
      repository = new PrismaSaleRepository(mockPrisma as unknown as PrismaClient);
    });

    it('criterio 1: busca por número de factura (invoiceNumber) con modo insensible a mayúsculas', async () => {
      await repository.findAll({ search: 'FAC-000001' });

      expect(mockPrisma.sale.findMany).toHaveBeenCalledTimes(1);
      const findArgs = mockPrisma.sale.findMany.mock.calls[0][0];

      expect(findArgs.where).toEqual({
        AND: [
          {
            OR: [
              { invoiceNumber: { contains: 'FAC-000001', mode: 'insensitive' } },
              { customer: { name: { contains: 'FAC-000001', mode: 'insensitive' } } },
              { customer: { documentNumber: { contains: 'FAC-000001', mode: 'insensitive' } } },
            ],
          },
        ],
      });
      expect(mockPrisma.sale.count).toHaveBeenCalledWith({
        where: findArgs.where,
      });
    });

    it('criterio 2: busca por nombre del cliente (customer.name) con modo insensible a mayúsculas', async () => {
      await repository.findAll({ search: 'María Rodríguez' });

      const findArgs = mockPrisma.sale.findMany.mock.calls[0][0];
      expect(findArgs.where.AND[0].OR).toContainEqual({
        customer: { name: { contains: 'María Rodríguez', mode: 'insensitive' } },
      });
    });

    it('criterio 3: busca por documento de identidad del cliente (customer.documentNumber)', async () => {
      await repository.findAll({ search: '1017001002' });

      const findArgs = mockPrisma.sale.findMany.mock.calls[0][0];
      expect(findArgs.where.AND[0].OR).toContainEqual({
        customer: { documentNumber: { contains: '1017001002', mode: 'insensitive' } },
      });
    });

    it('combina búsqueda textual con filtro de estado (ej. COMPLETED) mediante AND', async () => {
      await repository.findAll({ search: 'FAC-000001', status: 'COMPLETED' });

      const findArgs = mockPrisma.sale.findMany.mock.calls[0][0];
      expect(findArgs.where).toEqual({
        AND: [
          {
            OR: [
              { invoiceNumber: { contains: 'FAC-000001', mode: 'insensitive' } },
              { customer: { name: { contains: 'FAC-000001', mode: 'insensitive' } } },
              { customer: { documentNumber: { contains: 'FAC-000001', mode: 'insensitive' } } },
            ],
          },
          { status: 'COMPLETED' },
        ],
      });
    });

    it('soporta paginación con más de 50 facturas (acceso a registros más allá de la primera página)', async () => {
      // Simular una base con 75 facturas en total
      const totalInvoices = 75;
      const pageSize = 20;

      // Generar 15 facturas para la página 4 (skip 60, take 20)
      const page4Items = Array.from({ length: 15 }, (_, i) => ({
        ...sampleRawSale,
        id: `sale-${61 + i}`,
        invoiceNumber: `FAC-${String(61 + i).padStart(6, '0')}`,
        customer: {
          id: `cust-${61 + i}`,
          name: `Cliente Número ${61 + i}`,
          documentNumber: `9000000${61 + i}`,
        },
      }));

      mockPrisma.sale.findMany.mockResolvedValue(page4Items);
      mockPrisma.sale.count.mockResolvedValue(totalInvoices);

      // Solicitar página 4 con límite de 20
      const result = await repository.findAll({
        page: 4,
        limit: pageSize,
      });

      expect(mockPrisma.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 60, // (4 - 1) * 20 = 60 (supera las 50 facturas iniciales)
          take: 20,
        }),
      );

      expect(result.total).toBe(75);
      expect(result.items).toHaveLength(15);
      expect(result.items[0].invoiceNumber).toBe('FAC-000061');
      expect(result.items[14].invoiceNumber).toBe('FAC-000075');
    });

    it('permite buscar y paginar simultáneamente más allá de 50 registros', async () => {
      mockPrisma.sale.findMany.mockResolvedValue([
        {
          ...sampleRawSale,
          id: 'sale-55',
          invoiceNumber: 'FAC-000055',
        },
      ]);
      mockPrisma.sale.count.mockResolvedValue(65);

      const result = await repository.findAll({
        search: 'FAC',
        page: 3,
        limit: 20,
      });

      expect(mockPrisma.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 40,
          take: 20,
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.any(Array),
              }),
            ]),
          }),
        }),
      );

      expect(result.total).toBe(65);
      expect(result.items[0].invoiceNumber).toBe('FAC-000055');
    });
  });
});
