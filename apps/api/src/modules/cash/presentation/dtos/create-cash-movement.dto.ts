import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import {
  CashMovementType,
  PaymentMethod,
  CreateCashMovementPayload,
} from '@farmacia/contracts';

export class CreateCashMovementDto implements CreateCashMovementPayload {
  movementType!: CashMovementType;
  amount!: number;
  paymentMethod?: PaymentMethod;
  reason!: string;
  referenceDocumentType?: string;
  referenceDocumentId?: string;
}

@Injectable()
export class CreateCashMovementValidationPipe implements PipeTransform {
  public transform(value: unknown): CreateCashMovementDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
    }

    const record = value as Record<string, unknown>;

    const validMovementTypes: CashMovementType[] = [
      'INGRESO_VENTA',
      'INGRESO_MANUAL',
      'EGRESO_MANUAL',
      'EGRESO_PAGO_PROVEEDOR',
    ];

    if (
      typeof record.movementType !== 'string' ||
      !validMovementTypes.includes(record.movementType as CashMovementType)
    ) {
      throw new BadRequestException(
        `El campo "movementType" debe ser uno de: ${validMovementTypes.join(', ')}`
      );
    }

    const amount = Number(record.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new BadRequestException('El campo "amount" debe ser un número positivo mayor a 0.');
    }

    if (typeof record.reason !== 'string' || !record.reason.trim()) {
      throw new BadRequestException('El campo "reason" (motivo) es obligatorio.');
    }

    const validPaymentMethods: PaymentMethod[] = [
      'EFECTIVO',
      'TRANSFERENCIA',
      'TARJETA_DEBITO',
      'TARJETA_CREDITO',
    ];

    let paymentMethod: PaymentMethod = 'EFECTIVO';
    if (record.paymentMethod !== undefined) {
      if (
        typeof record.paymentMethod !== 'string' ||
        !validPaymentMethods.includes(record.paymentMethod as PaymentMethod)
      ) {
        throw new BadRequestException(
          `El medio de pago debe ser uno de: ${validPaymentMethods.join(', ')}`
        );
      }
      paymentMethod = record.paymentMethod as PaymentMethod;
    }

    return {
      movementType: record.movementType as CashMovementType,
      amount: Number(amount.toFixed(2)),
      paymentMethod,
      reason: record.reason.trim(),
      referenceDocumentType:
        typeof record.referenceDocumentType === 'string'
          ? record.referenceDocumentType.trim()
          : undefined,
      referenceDocumentId:
        typeof record.referenceDocumentId === 'string'
          ? record.referenceDocumentId.trim()
          : undefined,
    };
  }
}
