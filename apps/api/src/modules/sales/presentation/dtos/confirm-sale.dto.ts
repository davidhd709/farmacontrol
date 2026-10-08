import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import {
  ConfirmSalePayload,
  ConfirmSaleLineItemPayload,
  SalePaymentMethod,
} from '@farmacia/contracts';

export class ConfirmSaleDto implements ConfirmSalePayload {
  customerId?: string;
  paymentMethod!: SalePaymentMethod;
  bankAccountId?: string;
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
      'CREDITO',
    ];
    const paymentMethod = record.paymentMethod as SalePaymentMethod;
    if (!paymentMethod || !validMethods.includes(paymentMethod)) {
      throw new BadRequestException(
        `El medio de pago '${record.paymentMethod}' es inválido. Valores permitidos: ${validMethods.join(', ')}`,
      );
    }
    if (paymentMethod === 'TARJETA_DEBITO' || paymentMethod === 'TARJETA_CREDITO') {
      throw new BadRequestException(
        'El pago con tarjeta requiere una política de liquidación aprobada.',
      );
    }
    let bankAccountId: string | undefined;
    if (paymentMethod === 'TRANSFERENCIA') {
      if (
        typeof record.bankAccountId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          record.bankAccountId,
        )
      ) {
        throw new BadRequestException(
          'bankAccountId es obligatorio y debe ser UUID para TRANSFERENCIA.',
        );
      }
      bankAccountId = record.bankAccountId;
    } else if (record.bankAccountId !== undefined && record.bankAccountId !== null) {
      throw new BadRequestException('bankAccountId solo corresponde a TRANSFERENCIA.');
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
        throw new BadRequestException(
          `La cantidad del ítem ${index} debe ser un número mayor a cero.`,
        );
      }

      let presentationId: string | null = null;
      if (item.presentationId !== undefined && item.presentationId !== null) {
        if (typeof item.presentationId !== 'string' || !item.presentationId.trim()) {
          throw new BadRequestException(
            `El campo "presentationId" del ítem ${index} debe ser texto.`,
          );
        }
        presentationId = item.presentationId.trim();
      }

      // AUD-011: precio y descuento solo como montos válidos no negativos
      const optionalMoney = (raw: unknown, field: string): number | undefined => {
        if (raw === undefined || raw === null) return undefined;
        const parsed = typeof raw === 'number' ? raw : Number.NaN;
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new BadRequestException(
            `El campo "${field}" del ítem ${index} debe ser un número mayor o igual a cero.`,
          );
        }
        return parsed;
      };

      return {
        productId: item.productId.trim(),
        presentationId,
        quantityCommercial: qty,
        unitPriceOverride: optionalMoney(item.unitPriceOverride, 'unitPriceOverride'),
        discount: optionalMoney(item.discount, 'discount'),
      };
    });

    let amountPaid: number | undefined = undefined;
    if (record.amountPaid !== undefined && record.amountPaid !== null) {
      const parsedAmount = Number(record.amountPaid);
      if (isNaN(parsedAmount) || parsedAmount < 0) {
        throw new BadRequestException(
          'El campo "amountPaid" debe ser un número mayor o igual a cero.',
        );
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
      bankAccountId,
      amountPaid,
      notes,
      items,
    };
  }
}
