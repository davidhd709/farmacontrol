import { Injectable, Optional } from '@nestjs/common';
import { prisma, PrismaClient } from '@farmacia/database';
import { ISupplierRepository } from '../domain/supplier.repository';
import { Supplier } from '../domain/supplier.entity';
import { SupplierQueryFilters } from '@farmacia/contracts';

@Injectable()
export class PrismaSupplierRepository implements ISupplierRepository {
  private readonly client: PrismaClient;

  constructor(@Optional() customClient?: PrismaClient) {
    this.client = customClient ?? prisma;
  }

  async save(supplier: Supplier): Promise<void> {
    await this.client.supplier.upsert({
      where: { id: supplier.id },
      create: {
        id: supplier.id,
        taxId: supplier.taxId,
        name: supplier.name,
        contactName: supplier.contactName,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        isActive: supplier.isActive,
        createdAt: supplier.createdAt,
        updatedAt: supplier.updatedAt,
      },
      update: {
        taxId: supplier.taxId,
        name: supplier.name,
        contactName: supplier.contactName,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        isActive: supplier.isActive,
        updatedAt: supplier.updatedAt,
      },
    });
  }

  async findById(id: string): Promise<Supplier | null> {
    const raw = await this.client.supplier.findUnique({
      where: { id },
    });
    if (!raw) return null;
    return this.mapToDomain(raw);
  }

  async findByTaxId(taxId: string): Promise<Supplier | null> {
    const raw = await this.client.supplier.findUnique({
      where: { taxId: taxId.trim() },
    });
    if (!raw) return null;
    return this.mapToDomain(raw);
  }

  async findAll(filters: SupplierQueryFilters): Promise<{ items: Supplier[]; total: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.search) {
      const term = filters.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { taxId: { contains: term, mode: 'insensitive' } },
        { contactName: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [rawItems, total] = await Promise.all([
      this.client.supplier.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: 'asc' },
      }),
      this.client.supplier.count({ where }),
    ]);

    return {
      items: rawItems.map((r: any) => this.mapToDomain(r)),
      total,
    };
  }

  async delete(id: string): Promise<void> {
    await this.client.supplier.delete({
      where: { id },
    });
  }

  private mapToDomain(raw: any): Supplier {
    return Supplier.reconstitute({
      id: raw.id,
      taxId: raw.taxId,
      name: raw.name,
      contactName: raw.contactName,
      phone: raw.phone,
      email: raw.email,
      address: raw.address,
      isActive: raw.isActive,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }
}
