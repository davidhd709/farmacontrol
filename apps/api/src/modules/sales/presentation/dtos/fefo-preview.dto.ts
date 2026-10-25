import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { FefoPreviewPayload, FefoPreviewLinePayload } from '@farmacia/contracts';

export class FefoPreviewRequestDto implements FefoPreviewPayload {
  items!: FefoPreviewLinePayload[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class FefoPreviewValidationPipe implements PipeTransform {
  public transform(value: unknown): FefoPreviewRequestDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
    }
    const record = value as Record<string, unknown>;
    if (!Array.isArray(record.items) || record.items.length < 1 || record.items.length > 100) {
      throw new BadRequestException(
        'La vista previa debe contener entre 1 y 100 productos en "items".',
      );
    }
    const items = record.items.map((raw, index): FefoPreviewLinePayload => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new BadRequestException(`El ítem en la posición ${index} no es válido.`);
      }
      const item = raw as Record<string, unknown>;
      if (typeof item.productId !== 'string' || !UUID.test(item.productId)) {
        throw new BadRequestException(`El ítem ${index} debe incluir "productId" UUID válido.`);
      }
      if (
        typeof item.quantityCommercial !== 'number' ||
        !Number.isFinite(item.quantityCommercial) ||
        item.quantityCommercial <= 0
      ) {
        throw new BadRequestException(
          `La cantidad del ítem ${index} debe ser un número mayor a cero.`,
        );
      }
      if (
        item.presentationId !== undefined &&
        item.presentationId !== null &&
        (typeof item.presentationId !== 'string' || !UUID.test(item.presentationId))
      ) {
        throw new BadRequestException(`El campo "presentationId" del ítem ${index} debe ser UUID.`);
      }
      return {
        productId: item.productId,
        presentationId: (item.presentationId as string | null | undefined) ?? null,
        quantityCommercial: item.quantityCommercial,
      };
    });
    return { items };
  }
}
