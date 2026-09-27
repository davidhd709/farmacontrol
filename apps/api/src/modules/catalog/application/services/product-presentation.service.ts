import { Inject, Injectable, Optional } from '@nestjs/common';
import type {
  CreateProductPresentationPayload,
  ProductPresentationDto,
  UpdateProductPresentationPayload,
} from '@farmacia/contracts';
import {
  PRODUCT_PRESENTATION_REPOSITORY_PORT,
  type ProductPresentationRepositoryPort,
} from '../ports/product-presentation.repository.port';
import {
  PRODUCT_REPOSITORY_PORT,
  type ProductRepositoryPort,
} from '../ports/product.repository.port';
import { ProductPresentation } from '../../domain/entities/product-presentation.entity';
import { ProductNotFoundException } from '../../domain/exceptions/product.exceptions';
import {
  CannotDeactivateDefaultPresentationException,
  ProductPresentationBarcodeAlreadyExistsException,
  ProductPresentationNameAlreadyExistsException,
  ProductPresentationNotFoundException,
} from '../../domain/exceptions/product-presentation.exceptions';
import { AuditService } from '../../../audit/application/services/audit.service';
import type { AuditContext } from './category.service';

@Injectable()
export class ProductPresentationService {
  constructor(
    @Inject(PRODUCT_PRESENTATION_REPOSITORY_PORT)
    private readonly presentationRepository: ProductPresentationRepositoryPort,
    @Inject(PRODUCT_REPOSITORY_PORT)
    private readonly productRepository: ProductRepositoryPort,
    @Optional()
    private readonly auditService?: AuditService,
  ) {}

  public async createPresentation(
    productId: string,
    payload: CreateProductPresentationPayload,
    auditCtx?: AuditContext,
  ): Promise<ProductPresentation> {
    const product = await this.productRepository.findById(productId);
    if (!product) {
      throw new ProductNotFoundException(productId);
    }

    const existingName = await this.presentationRepository.findByProductIdAndName(
      productId,
      payload.name,
    );
    if (existingName) {
      throw new ProductPresentationNameAlreadyExistsException(product.name, payload.name.trim());
    }

    if (payload.barcode && payload.barcode.trim()) {
      const existingBarcode = await this.presentationRepository.findByBarcode(payload.barcode);
      if (existingBarcode) {
        throw new ProductPresentationBarcodeAlreadyExistsException(payload.barcode.trim());
      }
    }

    if (payload.isDefault) {
      await this.presentationRepository.unsetDefaultPresentations(productId);
    }

    const presentation = ProductPresentation.create({
      productId,
      name: payload.name,
      barcode: payload.barcode,
      conversionFactor: payload.conversionFactor,
      price: payload.price,
      cost: payload.cost ?? 0,
      isDefault: payload.isDefault ?? false,
    });

    const saved = await this.presentationRepository.save(presentation);

    if (this.auditService) {
      await this.auditService.recordEvent({
        userId: auditCtx?.userId || null,
        action: 'catalog:presentation_created',
        entity: 'ProductPresentation',
        entityId: saved.id,
        details: {
          productId: saved.productId,
          productName: product.name,
          name: saved.name,
          conversionFactor: saved.conversionFactor,
          price: saved.price,
          isDefault: saved.isDefault,
        },
        ipAddress: auditCtx?.ipAddress || null,
        correlationId: auditCtx?.correlationId || null,
      });
    }

    return saved;
  }

  public async getPresentationsByProductId(
    productId: string,
    options?: { isActive?: boolean },
  ): Promise<ProductPresentationDto[]> {
    const product = await this.productRepository.findById(productId);
    if (!product) {
      throw new ProductNotFoundException(productId);
    }

    const list = await this.presentationRepository.listByProductId(productId, options);
    return list.map((p) => p.toDto());
  }

  public async getPresentationById(
    productId: string,
    presentationId: string,
  ): Promise<ProductPresentation> {
    const presentation = await this.presentationRepository.findById(presentationId);
    if (!presentation || presentation.productId !== productId) {
      throw new ProductPresentationNotFoundException(presentationId);
    }
    return presentation;
  }

  public async updatePresentation(
    productId: string,
    presentationId: string,
    payload: UpdateProductPresentationPayload,
    auditCtx?: AuditContext,
  ): Promise<ProductPresentation> {
    const product = await this.productRepository.findById(productId);
    if (!product) {
      throw new ProductNotFoundException(productId);
    }

    const presentation = await this.getPresentationById(productId, presentationId);

    if (payload.name && payload.name.trim().toLowerCase() !== presentation.name.toLowerCase()) {
      const existingName = await this.presentationRepository.findByProductIdAndName(
        productId,
        payload.name,
      );
      if (existingName && existingName.id !== presentation.id) {
        throw new ProductPresentationNameAlreadyExistsException(product.name, payload.name.trim());
      }
    }

    if (
      payload.barcode &&
      payload.barcode.trim().toLowerCase() !== (presentation.barcode?.toLowerCase() ?? '')
    ) {
      const existingBarcode = await this.presentationRepository.findByBarcode(payload.barcode);
      if (existingBarcode && existingBarcode.id !== presentation.id) {
        throw new ProductPresentationBarcodeAlreadyExistsException(payload.barcode.trim());
      }
    }

    if (payload.isActive === false && presentation.isDefault) {
      throw new CannotDeactivateDefaultPresentationException();
    }

    if (payload.isDefault && !presentation.isDefault) {
      await this.presentationRepository.unsetDefaultPresentations(productId, presentation.id);
    }

    presentation.update(payload);
    const updated = await this.presentationRepository.update(presentation);

    if (this.auditService) {
      await this.auditService.recordEvent({
        userId: auditCtx?.userId || null,
        action: 'catalog:presentation_updated',
        entity: 'ProductPresentation',
        entityId: updated.id,
        details: {
          productId: updated.productId,
          productName: product.name,
          name: updated.name,
          conversionFactor: updated.conversionFactor,
          price: updated.price,
          isDefault: updated.isDefault,
          isActive: updated.isActive,
        },
        ipAddress: auditCtx?.ipAddress || null,
        correlationId: auditCtx?.correlationId || null,
      });
    }

    return updated;
  }

  public async deactivatePresentation(
    productId: string,
    presentationId: string,
    auditCtx?: AuditContext,
  ): Promise<ProductPresentation> {
    const presentation = await this.getPresentationById(productId, presentationId);

    if (presentation.isDefault) {
      throw new CannotDeactivateDefaultPresentationException();
    }

    presentation.deactivate();
    const updated = await this.presentationRepository.update(presentation);

    if (this.auditService) {
      await this.auditService.recordEvent({
        userId: auditCtx?.userId || null,
        action: 'catalog:presentation_deactivated',
        entity: 'ProductPresentation',
        entityId: updated.id,
        details: {
          productId: updated.productId,
          name: updated.name,
        },
        ipAddress: auditCtx?.ipAddress || null,
        correlationId: auditCtx?.correlationId || null,
      });
    }

    return updated;
  }

  public async convertUnits(
    productId: string,
    presentationId: string,
    quantity: number,
    direction: 'toBase' | 'fromBase',
  ): Promise<{
    presentationId: string;
    presentationName: string;
    conversionFactor: number;
    baseUnits?: number;
    wholePresentations?: number;
    remainderBaseUnits?: number;
  }> {
    const presentation = await this.getPresentationById(productId, presentationId);

    if (direction === 'toBase') {
      const baseUnits = presentation.toBaseUnits(quantity);
      return {
        presentationId: presentation.id,
        presentationName: presentation.name,
        conversionFactor: presentation.conversionFactor,
        baseUnits,
      };
    }

    const { wholePresentations, remainderBaseUnits } = presentation.fromBaseUnits(quantity);
    return {
      presentationId: presentation.id,
      presentationName: presentation.name,
      conversionFactor: presentation.conversionFactor,
      wholePresentations,
      remainderBaseUnits,
    };
  }
}
