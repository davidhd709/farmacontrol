import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  SupplierDto,
  CreateSupplierPayload,
  UpdateSupplierPayload,
  SupplierQueryFilters,
  PaginatedResponse,
  SYSTEM_ROLES,
} from '@farmacia/contracts';
import { ISupplierRepository, SUPPLIER_REPOSITORY } from '../domain/supplier.repository';
import { Supplier } from '../domain/supplier.entity';
import {
  SupplierNotFoundException,
  SupplierAlreadyExistsException,
  SupplierTaxIdChangeForbiddenException,
} from '../domain/supplier.exceptions';
import { AuditService } from '../../audit/application/services/audit.service';

export interface AuditContext {
  userId?: string | null;
  roles?: string[];
  ipAddress?: string | null;
  correlationId?: string | null;
}

@Injectable()
export class SupplierService {
  constructor(
    @Inject(SUPPLIER_REPOSITORY)
    private readonly supplierRepository: ISupplierRepository,
    @Optional()
    private readonly auditService?: AuditService,
  ) {}

  async createSupplier(input: CreateSupplierPayload, auditCtx?: AuditContext): Promise<Supplier> {
    const existing = await this.supplierRepository.findByTaxId(input.taxId);
    if (existing) {
      throw new SupplierAlreadyExistsException(input.taxId);
    }

    const supplier = Supplier.create({
      taxId: input.taxId,
      name: input.name,
      contactName: input.contactName,
      phone: input.phone,
      email: input.email,
      address: input.address,
    });

    await this.supplierRepository.save(supplier);

    if (this.auditService) {
      await this.auditService.recordEvent({
        action: 'suppliers:supplier_created',
        entity: 'Supplier',
        entityId: supplier.id,
        userId: auditCtx?.userId || null,
        ipAddress: auditCtx?.ipAddress || null,
        correlationId: auditCtx?.correlationId || null,
        details: {
          taxId: supplier.taxId,
          name: supplier.name,
        },
      });
    }

    return supplier;
  }

  async getSupplierById(id: string): Promise<Supplier> {
    const supplier = await this.supplierRepository.findById(id);
    if (!supplier) {
      throw new SupplierNotFoundException(id);
    }
    return supplier;
  }

  async getSuppliers(filters: SupplierQueryFilters): Promise<PaginatedResponse<SupplierDto>> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));

    const result = await this.supplierRepository.findAll({
      ...filters,
      page,
      pageSize,
    });

    return {
      items: result.items.map((s) => s.toDto()),
      total: result.total,
      page,
      pageSize,
      totalPages: Math.ceil(result.total / pageSize),
    };
  }

  async updateSupplier(
    id: string,
    input: UpdateSupplierPayload,
    auditCtx?: AuditContext,
  ): Promise<Supplier> {
    const supplier = await this.getSupplierById(id);

    const nextTaxId = input.taxId?.trim();
    if (nextTaxId !== undefined && nextTaxId !== supplier.taxId) {
      if (!auditCtx?.roles?.includes(SYSTEM_ROLES.ADMIN)) {
        throw new SupplierTaxIdChangeForbiddenException();
      }
      const duplicate = await this.supplierRepository.findByTaxId(nextTaxId);
      if (duplicate && duplicate.id !== id) {
        throw new SupplierAlreadyExistsException(nextTaxId);
      }
    }

    supplier.update(input);
    await this.supplierRepository.save(supplier);

    if (this.auditService) {
      await this.auditService.recordEvent({
        action: 'suppliers:supplier_updated',
        entity: 'Supplier',
        entityId: supplier.id,
        userId: auditCtx?.userId || null,
        ipAddress: auditCtx?.ipAddress || null,
        correlationId: auditCtx?.correlationId || null,
        details: {
          taxId: supplier.taxId,
          name: supplier.name,
          isActive: supplier.isActive,
        },
      });
    }

    return supplier;
  }

  async deactivateSupplier(id: string, auditCtx?: AuditContext): Promise<Supplier> {
    const supplier = await this.getSupplierById(id);
    supplier.deactivate();
    await this.supplierRepository.save(supplier);

    if (this.auditService) {
      await this.auditService.recordEvent({
        action: 'suppliers:supplier_deactivated',
        entity: 'Supplier',
        entityId: supplier.id,
        userId: auditCtx?.userId || null,
        ipAddress: auditCtx?.ipAddress || null,
        correlationId: auditCtx?.correlationId || null,
        details: {
          taxId: supplier.taxId,
          name: supplier.name,
        },
      });
    }

    return supplier;
  }
}
