import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { ReceivePurchasePayload, ReceivePurchaseLinePayload } from '@farmacia/contracts';

export class ReceivePurchaseDto implements ReceivePurchasePayload {
  supplierId!: string;
  invoiceNumber!: string;
  purchaseDate!: string;
  dueDate?: string | null;
  paymentCondition?: string | null;
  notes?: string | null;
  lines!: ReceivePurchaseLinePayload[];
}

@Injectable()
export class ReceivePurchaseValidationPipe implements PipeTransform {
  public transform(value: unknown): ReceivePurchaseDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
    }

    const record = value as Record<string, unknown>;

    if (typeof record.supplierId !== 'string' || !record.supplierId.trim()) {
      throw new BadRequestException('El campo "supplierId" es obligatorio.');
    }

    if (typeof record.invoiceNumber !== 'string' || !record.invoiceNumber.trim()) {
      throw new BadRequestException('El campo "invoiceNumber" es obligatorio.');
    }

    if (typeof record.purchaseDate !== 'string' || !record.purchaseDate.trim()) {
      throw new BadRequestException('El campo "purchaseDate" es obligatorio.');
    }
    const parsedDate = new Date(record.purchaseDate.trim());
    if (isNaN(parsedDate.getTime())) {
      throw new BadRequestException('El campo "purchaseDate" debe ser una fecha válida.');
    }

    if (!Array.isArray(record.lines) || record.lines.length === 0) {
      throw new BadRequestException('El campo "lines" debe ser un arreglo con al menos una línea.');
    }

    const lines: ReceivePurchaseLinePayload[] = record.lines.map((item, idx) => {
      if (!item || typeof item !== 'object') {
        throw new BadRequestException(`La línea en posición ${idx} no es válida.`);
      }
      const line = item as Record<string, unknown>;

      if (typeof line.productId !== 'string' || !line.productId.trim()) {
        throw new BadRequestException(
          `El campo "productId" es obligatorio en la línea ${idx + 1}.`,
        );
      }

      if (
        line.lotNumber !== undefined &&
        line.lotNumber !== null &&
        (typeof line.lotNumber !== 'string' || !line.lotNumber.trim())
      ) {
        throw new BadRequestException(
          `El número de lote de la línea ${idx + 1} debe ser texto no vacío o nulo.`,
        );
      }

      if (
        line.expirationDate !== undefined &&
        line.expirationDate !== null &&
        (typeof line.expirationDate !== 'string' ||
          !line.expirationDate.trim() ||
          isNaN(new Date(String(line.expirationDate)).getTime()))
      ) {
        throw new BadRequestException(
          `La fecha de vencimiento de la línea ${idx + 1} debe ser válida o nula.`,
        );
      }
      let serialNumbers: string[] | undefined;
      if (line.serialNumbers !== undefined) {
        if (
          !Array.isArray(line.serialNumbers) ||
          line.serialNumbers.some((serial) => typeof serial !== 'string' || !serial.trim())
        ) {
          throw new BadRequestException(
            `"serialNumbers" debe ser un arreglo de series no vacías en la línea ${idx + 1}.`,
          );
        }
        serialNumbers = (line.serialNumbers as string[]).map((serial) =>
          serial.trim().toUpperCase(),
        );
        if (new Set(serialNumbers).size !== serialNumbers.length) {
          throw new BadRequestException(
            `"serialNumbers" no puede contener series repetidas en la línea ${idx + 1}.`,
          );
        }
      }

      const qty = Number(line.quantityCommercial);
      if (isNaN(qty) || qty <= 0) {
        throw new BadRequestException(
          `La cantidad comercial debe ser un número mayor a 0 en la línea ${idx + 1}.`,
        );
      }

      const cost = Number(line.unitCost);
      if (isNaN(cost) || cost < 0) {
        throw new BadRequestException(
          `El costo unitario no puede ser negativo en la línea ${idx + 1}.`,
        );
      }

      return {
        productId: line.productId.trim(),
        presentationId:
          typeof line.presentationId === 'string' && line.presentationId.trim()
            ? line.presentationId.trim()
            : null,
        lotNumber: typeof line.lotNumber === 'string' ? line.lotNumber.trim().toUpperCase() : null,
        expirationDate: typeof line.expirationDate === 'string' ? line.expirationDate.trim() : null,
        serialNumbers,
        quantityCommercial: qty,
        unitCost: cost,
        locationId: typeof line.locationId === 'string' ? line.locationId.trim() : undefined,
      };
    });

    let dueDate: string | null = null;
    if (typeof record.dueDate === 'string' && record.dueDate.trim()) {
      const parsedDueDate = new Date(record.dueDate.trim());
      if (isNaN(parsedDueDate.getTime())) {
        throw new BadRequestException('El campo "dueDate" debe ser una fecha válida.');
      }
      dueDate = record.dueDate.trim();
    }

    const paymentCondition =
      typeof record.paymentCondition === 'string' && record.paymentCondition.trim()
        ? record.paymentCondition.trim()
        : null;

    return {
      supplierId: record.supplierId.trim(),
      invoiceNumber: record.invoiceNumber.trim().toUpperCase(),
      purchaseDate: record.purchaseDate.trim(),
      dueDate,
      paymentCondition,
      notes: typeof record.notes === 'string' ? record.notes.trim() || null : null,
      lines,
    };
  }
}
