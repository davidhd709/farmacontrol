import { Inject, Injectable, Optional } from '@nestjs/common';
import { prisma } from '@farmacia/database';
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
  ProductPresentationCrossProductException,
  ProductPresentationCycleException,
  ProductPresentationInvalidQuantityException,
  ProductPresentationNameAlreadyExistsException,
  ProductPresentationNotFoundException,
  ProductPresentationSelfReferenceException,
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

    // Resolver nombre si no se proporcionó pero se especificó unitOfMeasureId
    let finalName = (payload.name || '').trim();
    if (!finalName && payload.unitOfMeasureId) {
      const uom = await prisma.unitOfMeasure.findUnique({
        where: { id: payload.unitOfMeasureId },
      });
      if (uom) {
        finalName = uom.name;
      }
    }
    if (!finalName) {
      finalName = 'Presentación Comercial';
    }

    const existingName = await this.presentationRepository.findByProductIdAndName(
      productId,
      finalName,
    );
    if (existingName) {
      throw new ProductPresentationNameAlreadyExistsException(product.name, finalName);
    }

    if (payload.barcode && payload.barcode.trim()) {
      const existingBarcode = await this.presentationRepository.findByBarcode(payload.barcode);
      if (existingBarcode) {
        throw new ProductPresentationBarcodeAlreadyExistsException(payload.barcode.trim());
      }
    }

    if (payload.quantityContained !== undefined && payload.quantityContained <= 0) {
      throw new ProductPresentationInvalidQuantityException(payload.quantityContained);
    }
    if (payload.conversionFactor !== undefined && payload.conversionFactor <= 0) {
      throw new ProductPresentationInvalidQuantityException(payload.conversionFactor);
    }

    const quantityContained = payload.quantityContained ?? payload.conversionFactor ?? 1;

    // Resolver factor acumulado y validar jerarquía
    const conversionFactor = await this.resolveBaseFactor({
      productId,
      containedPresentationId: payload.containedPresentationId ?? null,
      quantityContained,
    });

    if (payload.isDefault || payload.isDefaultSale) {
      await this.presentationRepository.unsetDefaultPresentations(productId);
    }

    const presentation = ProductPresentation.create({
      productId,
      unitOfMeasureId: payload.unitOfMeasureId ?? null,
      containedPresentationId: payload.containedPresentationId ?? null,
      name: finalName,
      barcode: payload.barcode,
      quantityContained,
      conversionFactor,
      price: payload.price,
      cost: payload.cost ?? 0,
      purchaseEnabled: payload.purchaseEnabled ?? true,
      saleEnabled: payload.saleEnabled ?? true,
      isDefault: payload.isDefault ?? false,
      isDefaultPurchase: payload.isDefaultPurchase ?? false,
      isDefaultSale: payload.isDefaultSale ?? (payload.isDefault ?? false),
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
          unitOfMeasureId: saved.unitOfMeasureId,
          containedPresentationId: saved.containedPresentationId,
          quantityContained: saved.quantityContained,
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
    options?: { isActive?: boolean; purchaseEnabled?: boolean; saleEnabled?: boolean },
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

    // Resolver nuevo factor acumulado si cambia quantityContained o containedPresentationId
    const newContainedId = payload.containedPresentationId !== undefined
      ? payload.containedPresentationId
      : presentation.containedPresentationId;

    if (payload.quantityContained !== undefined && payload.quantityContained <= 0) {
      throw new ProductPresentationInvalidQuantityException(payload.quantityContained);
    }

    const newQuantity = payload.quantityContained !== undefined
      ? payload.quantityContained
      : presentation.quantityContained;

    const newConversionFactor = await this.resolveBaseFactor({
      productId,
      currentPresentationId: presentation.id,
      containedPresentationId: newContainedId,
      quantityContained: newQuantity,
    });

    presentation.update({
      ...payload,
      conversionFactor: newConversionFactor,
      quantityContained: newQuantity,
      containedPresentationId: newContainedId,
    });

    const updated = await this.presentationRepository.update(presentation);

    // Propagar actualización de factores en cascada si el factor base cambió
    if (newConversionFactor !== presentation.conversionFactor) {
      await this.propagateFactorUpdate(productId, updated.id, newConversionFactor);
    }

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
          quantityContained: updated.quantityContained,
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

  /**
   * Motor central de conversión de unidades comerciales y base.
   */
  public async convertUnits(
    productId: string,
    presentationId: string,
    quantity: number,
    direction: 'toBase' | 'fromBase',
  ): Promise<{
    presentationId: string;
    presentationName: string;
    conversionFactor: number;
    baseUnits: number;
    wholePresentations: number;
    remainderBaseUnits: number;
  }> {
    const presentation = await this.getPresentationById(productId, presentationId);

    if (direction === 'toBase') {
      const baseUnits = presentation.toBaseUnits(quantity);
      return {
        presentationId: presentation.id,
        presentationName: presentation.name,
        conversionFactor: presentation.conversionFactor,
        baseUnits,
        wholePresentations: quantity,
        remainderBaseUnits: 0,
      };
    }

    const { wholePresentations, remainderBaseUnits } = presentation.fromBaseUnits(quantity);
    return {
      presentationId: presentation.id,
      presentationName: presentation.name,
      conversionFactor: presentation.conversionFactor,
      baseUnits: quantity,
      wholePresentations,
      remainderBaseUnits,
    };
  }

  /**
   * Resuelve el factor base para una presentación evitando ciclos y referencias cruzadas.
   */
  public async resolveBaseFactor(params: {
    productId: string;
    currentPresentationId?: string;
    containedPresentationId: string | null;
    quantityContained: number;
  }): Promise<number> {
    const { productId, currentPresentationId, containedPresentationId, quantityContained } = params;

    if (quantityContained <= 0) {
      throw new ProductPresentationInvalidQuantityException(quantityContained);
    }

    if (!containedPresentationId) {
      // Contiene directamente unidades base del producto
      return quantityContained;
    }

    if (currentPresentationId && containedPresentationId === currentPresentationId) {
      throw new ProductPresentationSelfReferenceException();
    }

    // Validar ciclo navegando la cadena de ancestros
    let currentAncestorId: string | null = containedPresentationId;
    const visited = new Set<string>();
    if (currentPresentationId) {
      visited.add(currentPresentationId);
    }

    let ancestorFactor = 1;

    while (currentAncestorId) {
      if (visited.has(currentAncestorId)) {
        throw new ProductPresentationCycleException();
      }
      visited.add(currentAncestorId);

      const ancestor = await this.presentationRepository.findById(currentAncestorId);
      if (!ancestor) {
        throw new ProductPresentationNotFoundException(currentAncestorId);
      }

      if (ancestor.productId !== productId) {
        throw new ProductPresentationCrossProductException();
      }

      if (currentAncestorId === containedPresentationId) {
        ancestorFactor = ancestor.conversionFactor;
      }

      currentAncestorId = ancestor.containedPresentationId;
    }

    return quantityContained * ancestorFactor;
  }

  /**
   * Propaga el cambio de factor a todas las presentaciones dependientes de este producto.
   */
  private async propagateFactorUpdate(
    productId: string,
    parentPresentationId: string,
    newParentFactor: number,
  ): Promise<void> {
    const children = await prisma.productPresentation.findMany({
      where: {
        productId,
        containedPresentationId: parentPresentationId,
      },
    });

    for (const child of children) {
      const updatedChildFactor = child.quantityContained * newParentFactor;
      await prisma.productPresentation.update({
        where: { id: child.id },
        data: { conversionFactor: updatedChildFactor },
      });
      await this.propagateFactorUpdate(productId, child.id, updatedChildFactor);
    }
  }
}
