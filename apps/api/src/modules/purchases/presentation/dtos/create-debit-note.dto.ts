import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import type { CreateDebitNotePayload } from '@farmacia/contracts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REASON_LENGTH = 500;

@Injectable()
export class CreateDebitNoteValidationPipe implements PipeTransform {
  public transform(value: unknown): CreateDebitNotePayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
    }
    const record = value as Record<string, unknown>;

    if (typeof record.reason !== 'string' || !record.reason.trim()) {
      throw new BadRequestException('El motivo de la nota débito es obligatorio.');
    }
    const reason = record.reason.trim();
    if (reason.length > MAX_REASON_LENGTH) {
      throw new BadRequestException(`El motivo no puede superar ${MAX_REASON_LENGTH} caracteres.`);
    }

    if (!Array.isArray(record.items) || record.items.length === 0) {
      throw new BadRequestException('La nota débito debe incluir al menos una línea a devolver.');
    }
    const items = record.items.map((raw, index) => {
      if (!raw || typeof raw !== 'object') {
        throw new BadRequestException(`El ítem ${index} no es válido.`);
      }
      const item = raw as Record<string, unknown>;
      if (typeof item.purchaseLineId !== 'string' || !UUID_REGEX.test(item.purchaseLineId)) {
        throw new BadRequestException(`El ítem ${index} requiere un "purchaseLineId" UUID.`);
      }
      if (
        typeof item.quantityCommercial !== 'number' ||
        !Number.isFinite(item.quantityCommercial) ||
        item.quantityCommercial <= 0
      ) {
        throw new BadRequestException(
          `El ítem ${index} requiere una "quantityCommercial" numérica mayor a cero.`,
        );
      }
      return { purchaseLineId: item.purchaseLineId, quantityCommercial: item.quantityCommercial };
    });

    return {
      purchaseId: typeof record.purchaseId === 'string' ? record.purchaseId : '',
      reason,
      items,
    };
  }
}
