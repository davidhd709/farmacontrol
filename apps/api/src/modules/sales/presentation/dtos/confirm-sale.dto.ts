import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { ConfirmSalePayload, ConfirmSaleLineItemPayload, SalePaymentMethod } from '@farmacia/contracts';

export class ConfirmSaleDto implements ConfirmSalePayload {
  customerId?: string;
  paymentMethod!: SalePaymentMethod;
  amountPaid?: number;
  notes?: string;
  items!: ConfirmSaleLineItemPayload[];
}

@Injectable()
export class ConfirmSaleValidationPipe implements PipeTransform {
  public transform(value: unknown): ConfirmSaleDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
    }

    const record = value as Record<string, unknown>;

    // Payment Method
    const validMethods: SalePaymentMethod[] = [
      'EFECTIVO',
      'TRANSFERENCIA',
      'TARJETA_DEBITO',
      'TARJETA_CREDITO',
    ];
    const paymentMethod = record.paymentMethod as SalePaymentMethod;
    if (!paymentMethod || !validMethods.includes(paymentMethod)) {
      throw new BadRequestException(
        `El medio de pago '${record.paymentMethod}' es inválido. Valores permitidos: ${validMethods.join(', ')}`
      );
    }

    // Customer ID (opcional)
    let customerId: string | undefined = undefined;
    if (record.customerId !== undefined && record.customerId !== null) {
      if (typeof record.customerId !== 'string' || !record.customerId.trim()) {
        throw new BadRequestException('El campo "customerId" debe ser un UUID válido.');
      }
      customerId = record.customerId.trim();
    }

    // Items
    if (!Array.isArray(record.items) || record.items.length === 0) {
      throw new BadRequestException('La venta debe contener al menos un producto en "items".');
    }

    const items: ConfirmSaleLineItemPayload[] = record.items.map((itemRaw, index) => {
      if (!itemRaw || typeof itemRaw !== 'object') {
        throw new BadRequestException(`El ítem en la posición ${index} no es válido.`);
      }
      const item = itemRaw as Record<string, unknown>;

      if (typeof item.productId !== 'string' || !item.productId.trim()) {
        throw new BadRequestException(`El ítem ${index} debe incluir "productId".`);
      }

      const qty = Number(item.quantityCommercial);
      if (isNaN(qty) || qty <= 0) {
        throw new BadRequestException(`La cantidad del ítem ${index} debe ser un número mayor a cero.`);
      }

      let presentationId: string | null = null;
      if (item.presentationId !== undefined && item.presentationId !== null) {
        if (typeof item.presentationId !== 'string' || !item.presentationId.trim()) {
          throw new BadRequestException(`El campo "presentationId" del ítem ${index} debe ser texto.`);
        }
        presentationId = item.presentationId.trim();
      }

      return {
        productId: item.productId.trim(),
        presentationId,
        quantityCommercial: qty,
        unitPriceOverride: item.unitPriceOverride !== undefined ? Number(item.unitPriceOverride) : undefined,
        discount: item.discount !== undefined ? Number(item.discount) : undefined,
      };
    });

    let amountPaid: number | undefined = undefined;
    if (record.amountPaid !== undefined && record.amountPaid !== null) {
      const parsedAmount = Number(record.amountPaid);
      if (isNaN(parsedAmount) || parsedAmount < 0) {
        throw new BadRequestException('El campo "amountPaid" debe ser un número mayor o igual a cero.');
      }
      amountPaid = parsedAmount;
    }

    let notes: string | undefined = undefined;
    if (record.notes !== undefined && record.notes !== null) {
      notes = String(record.notes).trim() || undefined;
    }

    return {
      customerId,
      paymentMethod,
      amountPaid,
      notes,
      items,
    };
  }
}
