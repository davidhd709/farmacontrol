import { Injectable, Optional } from '@nestjs/common';
import { prisma, PrismaClient, Prisma } from '@farmacia/database';
import { IThirdPartyRepository } from '../domain/third-party.repository.interface';
import { ThirdParty } from '../domain/third-party.entity';
import { ThirdPartyQueryFilters, PaginatedResponse } from '@farmacia/contracts';

@Injectable()
export class PrismaThirdPartyRepository implements IThirdPartyRepository {
  private readonly client: PrismaClient;

  constructor(@Optional() customClient?: PrismaClient) {
    this.client = customClient ?? prisma;
  }

  async save(tp: ThirdParty): Promise<void> {
    await this.client.thirdParty.upsert({
      where: { id: tp.id },
      create: {
        id: tp.id,
        personType: tp.personType,
        documentType: tp.documentType,
        documentNumber: tp.documentNumber,
        verificationDigit: tp.verificationDigit,
        name: tp.name,
        tradeName: tp.tradeName,
        contactName: tp.contactName,
        phone: tp.phone,
        email: tp.email,
        address: tp.address,
        city: tp.city,
        department: tp.department,
        taxRegime: tp.taxRegime,
        isCustomer: tp.isCustomer,
        isSupplier: tp.isSupplier,
        isEmployee: tp.isEmployee,
        isOther: tp.isOther,
        isActive: tp.isActive,
        notes: tp.notes,
        customerId: tp.customerId,
        supplierId: tp.supplierId,
        createdAt: tp.createdAt,
        updatedAt: tp.updatedAt,
      },
      update: {
        personType: tp.personType,
        documentType: tp.documentType,
        documentNumber: tp.documentNumber,
        verificationDigit: tp.verificationDigit,
        name: tp.name,
        tradeName: tp.tradeName,
        contactName: tp.contactName,
        phone: tp.phone,
        email: tp.email,
        address: tp.address,
        city: tp.city,
        department: tp.department,
        taxRegime: tp.taxRegime,
        isCustomer: tp.isCustomer,
        isSupplier: tp.isSupplier,
        isEmployee: tp.isEmployee,
        isOther: tp.isOther,
        isActive: tp.isActive,
        notes: tp.notes,
        customerId: tp.customerId,
        supplierId: tp.supplierId,
        updatedAt: tp.updatedAt,
      },
    });
  }

  async update(tp: ThirdParty): Promise<void> {
    await this.save(tp);
  }

  async findById(id: string): Promise<ThirdParty | null> {
    const raw = await this.client.thirdParty.findUnique({
      where: { id },
    });
    if (!raw) return null;
    return this.mapToDomain(raw);
  }

  async findByDocumentNumber(documentNumber: string): Promise<ThirdParty | null> {
    const raw = await this.client.thirdParty.findUnique({
      where: { documentNumber: documentNumber.trim() },
    });
    if (!raw) return null;
    return this.mapToDomain(raw);
  }

  async findPaginated(filters: ThirdPartyQueryFilters): Promise<PaginatedResponse<ThirdParty>> {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 ? filters.limit : (filters.pageSize || 20);
    const skip = (page - 1) * limit;

    const where: Prisma.ThirdPartyWhereInput = {};

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.role && filters.role !== 'ALL') {
      if (filters.role === 'CUSTOMER') where.isCustomer = true;
      else if (filters.role === 'SUPPLIER') where.isSupplier = true;
      else if (filters.role === 'EMPLOYEE') where.isEmployee = true;
      else if (filters.role === 'OTHER') where.isOther = true;
    }

    if (filters.search && filters.search.trim().length > 0) {
      const term = filters.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { documentNumber: { contains: term, mode: 'insensitive' } },
        { tradeName: { contains: term, mode: 'insensitive' } },
        { contactName: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.client.thirdParty.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.client.thirdParty.count({ where }),
    ]);

    const domainItems = items.map((raw) => this.mapToDomain(raw));

    return {
      items: domainItems,
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  private mapToDomain(raw: any): ThirdParty {
    return ThirdParty.reconstitute({
      id: raw.id,
      personType: raw.personType,
      documentType: raw.documentType,
      documentNumber: raw.documentNumber,
      verificationDigit: raw.verificationDigit,
      name: raw.name,
      tradeName: raw.tradeName,
      contactName: raw.contactName,
      phone: raw.phone,
      email: raw.email,
      address: raw.address,
      city: raw.city,
      department: raw.department,
      taxRegime: raw.taxRegime,
      isCustomer: raw.isCustomer,
      isSupplier: raw.isSupplier,
      isEmployee: raw.isEmployee,
      isOther: raw.isOther,
      isActive: raw.isActive,
      notes: raw.notes,
      customerId: raw.customerId,
      supplierId: raw.supplierId,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }
}
