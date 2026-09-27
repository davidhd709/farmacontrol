import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

export interface CancelSalePayload {
  reason: string;
}

export class CancelSaleDto implements CancelSalePayload {
  reason!: string;
}

@Injectable()
export class CancelSaleValidationPipe implements PipeTransform {
  public transform(value: unknown): CancelSaleDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
    }

    const record = value as Record<string, unknown>;

    if (typeof record.reason !== 'string' || !record.reason.trim()) {
      throw new BadRequestException('El campo "reason" (motivo de anulación) es obligatorio y no puede ser vacío.');
    }

    const trimmed = record.reason.trim();
    if (trimmed.length < 5 || trimmed.length > 300) {
      throw new BadRequestException('El motivo de anulación debe tener entre 5 y 300 caracteres.');
    }

    return {
      reason: trimmed,
    };
  }
}
