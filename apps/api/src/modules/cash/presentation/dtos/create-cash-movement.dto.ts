import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { CashMovementType, CreateCashMovementPayload } from '@farmacia/contracts';

export class CreateCashMovementDto implements CreateCashMovementPayload {
  movementType!: CashMovementType;
  amount!: number;
  paymentMethod?: 'EFECTIVO';
  reason!: string;
  referenceDocumentType?: string;
  referenceDocumentId?: string;
  counterpartAccountId?: string;
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
        `El campo "movementType" debe ser uno de: ${validMovementTypes.join(', ')}`,
      );
    }

    const amount = Number(record.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new BadRequestException('El campo "amount" debe ser un número positivo mayor a 0.');
    }

    // F8: el movimiento manual se contabiliza contra esta cuenta imputable
    if (
      typeof record.counterpartAccountId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        record.counterpartAccountId,
      )
    ) {
      throw new BadRequestException(
        'El campo "counterpartAccountId" (cuenta de contrapartida del asiento) es obligatorio.',
      );
    }

    if (typeof record.reason !== 'string' || !record.reason.trim()) {
      throw new BadRequestException('El campo "reason" (motivo) es obligatorio.');
    }

    if (record.paymentMethod !== undefined) {
      if (record.paymentMethod !== 'EFECTIVO') {
        throw new BadRequestException(
          'Caja solo admite movimientos en efectivo. Use Bancos para otros medios de pago.',
        );
      }
    }

    return {
      movementType: record.movementType as CashMovementType,
      amount: Number(amount.toFixed(2)),
      paymentMethod: 'EFECTIVO',
      reason: record.reason.trim(),
      counterpartAccountId: record.counterpartAccountId,
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
