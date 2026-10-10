import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  ThirdPartyDto,
  CreateThirdPartyPayload,
  UpdateThirdPartyPayload,
  ThirdPartyQueryFilters,
  PaginatedResponse,
} from '@farmacia/contracts';
import { prisma, PrismaClient } from '@farmacia/database';
import { IThirdPartyRepository } from '../domain/third-party.repository.interface';
import { ThirdParty } from '../domain/third-party.entity';
import {
  ThirdPartyNotFoundException,
  ThirdPartyAlreadyExistsException,
  ThirdPartyDocumentChangeForbiddenException,
} from '../domain/third-party.exceptions';
import { AuditService } from '../../audit/application/services/audit.service';

export const THIRD_PARTY_REPOSITORY = 'THIRD_PARTY_REPOSITORY';

export interface AuditContext {
  userId?: string | null;
  roles?: string[];
  ipAddress?: string | null;
  correlationId?: string | null;
}

@Injectable()
export class ThirdPartyService {
  private readonly db: PrismaClient;

  constructor(
    @Inject(THIRD_PARTY_REPOSITORY)
    private readonly thirdPartyRepository: IThirdPartyRepository,
    @Optional()
    private readonly auditService?: AuditService,
    @Optional()
    customPrisma?: PrismaClient,
  ) {
    this.db = customPrisma ?? prisma;
  }

  async createThirdParty(
    input: CreateThirdPartyPayload,
    auditCtx?: AuditContext,
  ): Promise<ThirdParty> {
    const docNumber = input.documentNumber.trim();
    const existing = await this.thirdPartyRepository.findByDocumentNumber(docNumber);
    if (existing) {
      throw new ThirdPartyAlreadyExistsException(docNumber);
    }

    const thirdParty = ThirdParty.create({
      personType: input.personType,
      documentType: input.documentType,
      documentNumber: docNumber,
      verificationDigit: input.verificationDigit,
      name: input.name,
      tradeName: input.tradeName,
      contactName: input.contactName,
      phone: input.phone,
      email: input.email,
      address: input.address,
      city: input.city,
      department: input.department,
      taxRegime: input.taxRegime,
      isCustomer: input.isCustomer,
      isSupplier: input.isSupplier,
      isEmployee: input.isEmployee,
      isOther: input.isOther,
      notes: input.notes,
    });

    // Sincronizar o vincular con Customer si tiene rol de cliente
    if (thirdParty.isCustomer) {
      let cust = await this.db.customer.findUnique({
        where: { documentNumber: docNumber },
      });
      if (!cust) {
        cust = await this.db.customer.create({
          data: {
            documentType: thirdParty.documentType,
            documentNumber: docNumber,
            name: thirdParty.name,
            phone: thirdParty.phone || null,
            email: thirdParty.email || null,
            address: thirdParty.address || null,
            isActive: true,
          },
        });
      }
      thirdParty.linkCustomer(cust.id);
    }

    // Sincronizar o vincular con Supplier si tiene rol de proveedor
    if (thirdParty.isSupplier) {
      let supp = await this.db.supplier.findUnique({
        where: { taxId: docNumber },
      });
      if (!supp) {
        supp = await this.db.supplier.create({
          data: {
            taxId: docNumber,
            name: thirdParty.name,
            contactName: thirdParty.contactName || thirdParty.tradeName || null,
            phone: thirdParty.phone || null,
            email: thirdParty.email || null,
            address: thirdParty.address || null,
            isActive: true,
          },
        });
      }
      thirdParty.linkSupplier(supp.id);
    }

    await this.thirdPartyRepository.save(thirdParty);

    if (this.auditService) {
      await this.auditService.recordEvent({
        action: 'third_parties:created',
        entity: 'ThirdParty',
        entityId: thirdParty.id,
        userId: auditCtx?.userId || null,
        details: {
          documentType: thirdParty.documentType,
          documentNumber: thirdParty.documentNumber,
          name: thirdParty.name,
          isCustomer: thirdParty.isCustomer,
          isSupplier: thirdParty.isSupplier,
          isEmployee: thirdParty.isEmployee,
          isOther: thirdParty.isOther,
        },
      });
    }

    return thirdParty;
  }

  /**
   * Terceros unificado (acuerdo del 4 de octubre): todo cliente o proveedor es un tercero.
   * Cuando se crean desde el POS o desde compras, se registra su tercero o se le agrega el
   * rol si ya existía con el mismo documento (p. ej. un proveedor que también compra).
   */
  async registerRole(
    role: 'customer' | 'supplier',
    record: {
      id: string;
      documentType?: string | null;
      documentNumber: string;
      name: string;
      contactName?: string | null;
      phone?: string | null;
      email?: string | null;
      address?: string | null;
    },
  ): Promise<void> {
    const documentNumber = record.documentNumber.trim();
    const existing = await this.db.thirdParty.findUnique({ where: { documentNumber } });
    if (existing) {
      await this.db.thirdParty.update({
        where: { id: existing.id },
        data:
          role === 'customer'
            ? { isCustomer: true, customerId: existing.customerId ?? record.id }
            : { isSupplier: true, supplierId: existing.supplierId ?? record.id },
      });
      return;
    }
    await this.db.thirdParty.create({
      data: {
        documentType: record.documentType || (role === 'supplier' ? 'NIT' : 'CC'),
        documentNumber,
        name: record.name,
        contactName: record.contactName ?? null,
        phone: record.phone ?? null,
        email: record.email ?? null,
        address: record.address ?? null,
        isCustomer: role === 'customer',
        isSupplier: role === 'supplier',
        customerId: role === 'customer' ? record.id : null,
        supplierId: role === 'supplier' ? record.id : null,
      },
    });
  }

  async updateThirdParty(
    id: string,
    input: UpdateThirdPartyPayload,
    auditCtx?: AuditContext,
  ): Promise<ThirdParty> {
    const thirdParty = await this.thirdPartyRepository.findById(id);
    if (!thirdParty) {
      throw new ThirdPartyNotFoundException(id);
    }

    if (input.documentNumber && input.documentNumber.trim() !== thirdParty.documentNumber) {
      throw new ThirdPartyDocumentChangeForbiddenException();
    }

    thirdParty.update(input);

    // Sincronizar Customer si corresponde
    if (thirdParty.isCustomer) {
      if (thirdParty.customerId) {
        await this.db.customer.update({
          where: { id: thirdParty.customerId },
          data: {
            name: thirdParty.name,
            phone: thirdParty.phone || null,
            email: thirdParty.email || null,
            address: thirdParty.address || null,
            isActive: thirdParty.isActive,
          },
        });
      } else {
        const cust = await this.db.customer.upsert({
          where: { documentNumber: thirdParty.documentNumber },
          create: {
            documentType: thirdParty.documentType,
            documentNumber: thirdParty.documentNumber,
            name: thirdParty.name,
            phone: thirdParty.phone || null,
            email: thirdParty.email || null,
            address: thirdParty.address || null,
            isActive: thirdParty.isActive,
          },
          update: {
            name: thirdParty.name,
            phone: thirdParty.phone || null,
            email: thirdParty.email || null,
            address: thirdParty.address || null,
            isActive: thirdParty.isActive,
          },
        });
        thirdParty.linkCustomer(cust.id);
      }
    }

    // Sincronizar Supplier si corresponde
    if (thirdParty.isSupplier) {
      if (thirdParty.supplierId) {
        await this.db.supplier.update({
          where: { id: thirdParty.supplierId },
          data: {
            name: thirdParty.name,
            contactName: thirdParty.contactName || thirdParty.tradeName || null,
            phone: thirdParty.phone || null,
            email: thirdParty.email || null,
            address: thirdParty.address || null,
            isActive: thirdParty.isActive,
          },
        });
      } else {
        const supp = await this.db.supplier.upsert({
          where: { taxId: thirdParty.documentNumber },
          create: {
            taxId: thirdParty.documentNumber,
            name: thirdParty.name,
            contactName: thirdParty.contactName || thirdParty.tradeName || null,
            phone: thirdParty.phone || null,
            email: thirdParty.email || null,
            address: thirdParty.address || null,
            isActive: thirdParty.isActive,
          },
          update: {
            name: thirdParty.name,
            contactName: thirdParty.contactName || thirdParty.tradeName || null,
            phone: thirdParty.phone || null,
            email: thirdParty.email || null,
            address: thirdParty.address || null,
            isActive: thirdParty.isActive,
          },
        });
        thirdParty.linkSupplier(supp.id);
      }
    }

    await this.thirdPartyRepository.update(thirdParty);

    if (this.auditService) {
      await this.auditService.recordEvent({
        action: 'third_parties:updated',
        entity: 'ThirdParty',
        entityId: thirdParty.id,
        userId: auditCtx?.userId || null,
        details: {
          name: thirdParty.name,
          isActive: thirdParty.isActive,
          isCustomer: thirdParty.isCustomer,
          isSupplier: thirdParty.isSupplier,
          isEmployee: thirdParty.isEmployee,
        },
      });
    }

    return thirdParty;
  }

  async deactivateThirdParty(id: string, auditCtx?: AuditContext): Promise<ThirdParty> {
    const thirdParty = await this.thirdPartyRepository.findById(id);
    if (!thirdParty) {
      throw new ThirdPartyNotFoundException(id);
    }

    thirdParty.deactivate();

    if (thirdParty.customerId) {
      await this.db.customer.update({
        where: { id: thirdParty.customerId },
        data: { isActive: false },
      });
    }

    if (thirdParty.supplierId) {
      await this.db.supplier.update({
        where: { id: thirdParty.supplierId },
        data: { isActive: false },
      });
    }

    await this.thirdPartyRepository.update(thirdParty);

    if (this.auditService) {
      await this.auditService.recordEvent({
        action: 'third_parties:deactivated',
        entity: 'ThirdParty',
        entityId: thirdParty.id,
        userId: auditCtx?.userId || null,
        details: { documentNumber: thirdParty.documentNumber, name: thirdParty.name },
      });
    }

    return thirdParty;
  }

  async activateThirdParty(id: string, auditCtx?: AuditContext): Promise<ThirdParty> {
    const thirdParty = await this.thirdPartyRepository.findById(id);
    if (!thirdParty) {
      throw new ThirdPartyNotFoundException(id);
    }

    thirdParty.activate();

    if (thirdParty.customerId) {
      await this.db.customer.update({
        where: { id: thirdParty.customerId },
        data: { isActive: true },
      });
    }

    if (thirdParty.supplierId) {
      await this.db.supplier.update({
        where: { id: thirdParty.supplierId },
        data: { isActive: true },
      });
    }

    await this.thirdPartyRepository.update(thirdParty);

    if (this.auditService) {
      await this.auditService.recordEvent({
        action: 'third_parties:activated',
        entity: 'ThirdParty',
        entityId: thirdParty.id,
        userId: auditCtx?.userId || null,
        details: { documentNumber: thirdParty.documentNumber, name: thirdParty.name },
      });
    }

    return thirdParty;
  }

  async getThirdPartyById(id: string): Promise<ThirdParty> {
    const thirdParty = await this.thirdPartyRepository.findById(id);
    if (!thirdParty) {
      throw new ThirdPartyNotFoundException(id);
    }
    return thirdParty;
  }

  async findPaginated(
    filters: ThirdPartyQueryFilters,
  ): Promise<PaginatedResponse<ThirdPartyDto>> {
    const res = await this.thirdPartyRepository.findPaginated(filters);
    return {
      items: res.items.map((tp) => tp.toDto()),
      total: res.total,
      page: res.page,
      pageSize: res.pageSize,
      totalPages: res.totalPages,
    };
  }
}
