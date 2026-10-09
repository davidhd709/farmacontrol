import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import type { CreateCreditNotePayload } from '@farmacia/contracts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFUND_METHODS = ['EFECTIVO', 'TRANSFERENCIA', 'CREDITO_CARTERA'] as const;
const MAX_REASON_LENGTH = 500;

@Injectable()
export class CreateCreditNoteValidationPipe implements PipeTransform {
  public transform(value: unknown): CreateCreditNotePayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
    }
    const record = value as Record<string, unknown>;

    if (typeof record.reason !== 'string' || !record.reason.trim()) {
      throw new BadRequestException('El motivo de la nota crédito es obligatorio.');
    }
    const reason = record.reason.trim();
    if (reason.length > MAX_REASON_LENGTH) {
      throw new BadRequestException(
        `El motivo no puede superar ${MAX_REASON_LENGTH} caracteres.`,
      );
    }

    let refundMethod: CreateCreditNotePayload['refundMethod'];
    if (record.refundMethod !== undefined && record.refundMethod !== null) {
      if (!(REFUND_METHODS as readonly unknown[]).includes(record.refundMethod)) {
        throw new BadRequestException(
          `Medio de reembolso inválido. Valores permitidos: ${REFUND_METHODS.join(', ')}.`,
        );
      }
      refundMethod = record.refundMethod as CreateCreditNotePayload['refundMethod'];
    }

    if (record.restock !== undefined && typeof record.restock !== 'boolean') {
      throw new BadRequestException('El campo "restock" debe ser booleano.');
    }

    if (!Array.isArray(record.items) || record.items.length === 0) {
      throw new BadRequestException('La nota crédito debe incluir al menos una línea a devolver.');
    }
    const items = record.items.map((raw, index) => {
      if (!raw || typeof raw !== 'object') {
        throw new BadRequestException(`El ítem ${index} no es válido.`);
      }
      const item = raw as Record<string, unknown>;
      if (typeof item.saleLineId !== 'string' || !UUID_REGEX.test(item.saleLineId)) {
        throw new BadRequestException(`El ítem ${index} requiere un "saleLineId" UUID.`);
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
      return { saleLineId: item.saleLineId, quantityCommercial: item.quantityCommercial };
    });

    return {
      saleId: typeof record.saleId === 'string' ? record.saleId : '',
      reason,
      refundMethod,
      restock: record.restock as boolean | undefined,
      items,
    };
  }
}
