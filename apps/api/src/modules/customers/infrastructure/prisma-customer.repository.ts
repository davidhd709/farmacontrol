import { Injectable, Optional } from '@nestjs/common';
import { prisma, PrismaClient, Prisma } from '@farmacia/database';
import { ICustomerRepository } from '../domain/customer.repository';
import { Customer } from '../domain/customer.entity';
import { CustomerQueryFilters } from '@farmacia/contracts';

@Injectable()
export class PrismaCustomerRepository implements ICustomerRepository {
  private readonly client: PrismaClient;

  constructor(@Optional() customClient?: PrismaClient) {
    this.client = customClient ?? prisma;
  }

  async save(customer: Customer): Promise<void> {
    await this.client.customer.upsert({
      where: { id: customer.id },
      create: {
        id: customer.id,
        documentType: customer.documentType,
        documentNumber: customer.documentNumber,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        isDefault: customer.isDefault,
        isActive: customer.isActive,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      },
      update: {
        documentType: customer.documentType,
        documentNumber: customer.documentNumber,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        isDefault: customer.isDefault,
        isActive: customer.isActive,
        updatedAt: customer.updatedAt,
      },
    });
  }

  async findById(id: string): Promise<Customer | null> {
    const raw = await this.client.customer.findUnique({
      where: { id },
    });
    if (!raw) return null;
    return this.mapToDomain(raw);
  }

  async findByDocumentNumber(documentNumber: string): Promise<Customer | null> {
    const raw = await this.client.customer.findUnique({
      where: { documentNumber: documentNumber.trim() },
    });
    if (!raw) return null;
    return this.mapToDomain(raw);
  }

  async findDefault(): Promise<Customer | null> {
    const raw = await this.client.customer.findFirst({
      where: { isDefault: true, isActive: true },
    });
    if (!raw) return null;
    return this.mapToDomain(raw);
  }

  async findAll(filters: CustomerQueryFilters): Promise<{ items: Customer[]; total: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.CustomerWhereInput = {};

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.search && filters.search.trim().length > 0) {
      const term = filters.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { documentNumber: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [rawItems, total] = await Promise.all([
      this.client.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      }),
      this.client.customer.count({ where }),
    ]);

    return {
      items: rawItems.map((r) => this.mapToDomain(r)),
      total,
    };
  }

  private mapToDomain(raw: {
    id: string;
    documentType: string;
    documentNumber: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    isDefault: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): Customer {
    return Customer.reconstitute({
      id: raw.id,
      documentType: raw.documentType,
      documentNumber: raw.documentNumber,
      name: raw.name,
      phone: raw.phone,
      email: raw.email,
      address: raw.address,
      isDefault: raw.isDefault,
      isActive: raw.isActive,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }
}
