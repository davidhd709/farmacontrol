import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import type { CreateCreditNotePayload, CreateCreditNoteLinePayload } from '@farmacia/contracts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFUND_METHODS = ['EFECTIVO', 'TRANSFERENCIA', 'CREDITO_CARTERA'] as const;

/** AUD-007: validación en tiempo de ejecución del cuerpo de una nota crédito. */
@Injectable()
export class CreateCreditNoteValidationPipe implements PipeTransform {
  public transform(value: unknown): CreateCreditNotePayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
    }
    const record = value as Record<string, unknown>;

    const reason = typeof record.reason === 'string' ? record.reason.trim() : '';
    if (reason.length < 5 || reason.length > 500) {
      throw new BadRequestException(
        'El motivo de la devolución debe tener entre 5 y 500 caracteres.',
      );
    }

    let refundMethod: CreateCreditNotePayload['refundMethod'];
    if (record.refundMethod !== undefined && record.refundMethod !== null) {
      if (!REFUND_METHODS.includes(record.refundMethod as (typeof REFUND_METHODS)[number])) {
        throw new BadRequestException(
          `La forma de reembolso debe ser una de: ${REFUND_METHODS.join(', ')}.`,
        );
      }
      refundMethod = record.refundMethod as CreateCreditNotePayload['refundMethod'];
    }

    let bankAccountId: string | undefined;
    if (record.bankAccountId !== undefined && record.bankAccountId !== null) {
      if (typeof record.bankAccountId !== 'string' || !UUID_RE.test(record.bankAccountId)) {
        throw new BadRequestException('bankAccountId debe ser un UUID válido.');
      }
      if (refundMethod !== 'TRANSFERENCIA') {
        throw new BadRequestException(
          'bankAccountId solo corresponde a reembolsos por transferencia.',
        );
      }
      bankAccountId = record.bankAccountId;
    }

    let restock: boolean | undefined;
    if (record.restock !== undefined && record.restock !== null) {
      if (typeof record.restock !== 'boolean') {
        throw new BadRequestException('restock debe ser verdadero o falso.');
      }
      restock = record.restock;
    }

    if (!Array.isArray(record.items) || record.items.length === 0 || record.items.length > 200) {
      throw new BadRequestException(
        'La nota crédito debe incluir entre 1 y 200 líneas a devolver.',
      );
    }
    const items: CreateCreditNoteLinePayload[] = record.items.map((raw, index) => {
      if (!raw || typeof raw !== 'object') {
        throw new BadRequestException(`La línea ${index} no es válida.`);
      }
      const item = raw as Record<string, unknown>;
      if (typeof item.saleLineId !== 'string' || !UUID_RE.test(item.saleLineId)) {
        throw new BadRequestException(`La línea ${index} debe incluir un saleLineId válido.`);
      }
      if (
        typeof item.quantityCommercial !== 'number' ||
        !Number.isFinite(item.quantityCommercial) ||
        item.quantityCommercial <= 0
      ) {
        throw new BadRequestException(
          `La cantidad a devolver de la línea ${index} debe ser un número mayor a cero.`,
        );
      }
      return { saleLineId: item.saleLineId, quantityCommercial: item.quantityCommercial };
    });

    return {
      saleId: typeof record.saleId === 'string' ? record.saleId : '',
      reason,
      refundMethod,
      bankAccountId,
      restock,
      items,
    };
  }
}
