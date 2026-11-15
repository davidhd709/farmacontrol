import { SYSTEM_PERMISSIONS, type TreasuryDocumentDto } from '@farmacia/contracts';

/**
 * Qué se puede hacer con un recibo o un egreso y por qué (rediseño, fase 4). Repite las reglas
 * que valida el servidor en treasury-vouchers.service (anular y corregir); la web solo las
 * explica, el servidor las vuelve a validar:
 * - un documento anulado es inmutable;
 * - uno automático lo emitió otro documento y se corrige o anula desde ese documento;
 * - anular exige el permiso del tipo; si es manual, además el contable;
 * - corregir anula y emite un reemplazo: exige además el permiso de crear ese reemplazo.
 * Ningún recibo o egreso se edita en el sitio.
 */
export interface TreasuryDocumentActions {
  canAnnul: boolean;
  canCorrect: boolean;
  /** Motivo concreto cuando alguna acción no está disponible */
  restriction: string | null;
  /** Dónde se corrige un documento automático */
  source: { label: string; to: string } | null;
}

export const TREASURY_REFERENCE_LABELS: Record<string, string> = {
  SALE: 'la venta',
  SALE_CANCEL: 'la anulación de la venta',
  CREDIT_NOTE: 'la nota crédito',
  CREDIT_NOTE_CANCEL: 'la anulación de la nota crédito',
  RECEIVABLE: 'la cuenta por cobrar',
  RECEIVABLE_PAYMENT: 'el abono de cartera',
  RECEIVABLE_PAYMENT_REVERSAL: 'la reversión del abono de cartera',
  PAYABLE: 'la cuenta por pagar',
  PAYABLE_PAYMENT: 'el pago a proveedor',
  PAYABLE_PAYMENT_REVERSAL: 'la reversión del pago a proveedor',
  EXPENSE: 'el gasto',
  EXPENSE_CANCEL: 'la anulación del gasto',
  EXPENSE_PAYMENT: 'el pago del gasto',
  EXPENSE_PAYMENT_REVERSAL: 'la reversión del pago del gasto',
  TREASURY_DOCUMENT_CANCEL: 'la anulación de otro recibo o egreso',
};

const SOURCE_PAGES: Record<string, { label: string; to: string }> = {
  SALE: { label: 'Ir al historial de ventas', to: '/sales' },
  SALE_CANCEL: { label: 'Ir al historial de ventas', to: '/sales' },
  CREDIT_NOTE: { label: 'Ir a notas crédito', to: '/credit-notes' },
  CREDIT_NOTE_CANCEL: { label: 'Ir a notas crédito', to: '/credit-notes' },
  RECEIVABLE: { label: 'Ir a cartera', to: '/receivables' },
  RECEIVABLE_PAYMENT: { label: 'Ir a cartera', to: '/receivables' },
  RECEIVABLE_PAYMENT_REVERSAL: { label: 'Ir a cartera', to: '/receivables' },
  PAYABLE: { label: 'Ir a cuentas por pagar', to: '/payables' },
  PAYABLE_PAYMENT: { label: 'Ir a cuentas por pagar', to: '/payables' },
  PAYABLE_PAYMENT_REVERSAL: { label: 'Ir a cuentas por pagar', to: '/payables' },
  EXPENSE: { label: 'Ir a gastos', to: '/expenses' },
  EXPENSE_CANCEL: { label: 'Ir a gastos', to: '/expenses' },
  EXPENSE_PAYMENT: { label: 'Ir a gastos', to: '/expenses' },
  EXPENSE_PAYMENT_REVERSAL: { label: 'Ir a gastos', to: '/expenses' },
};

/** «la nota crédito NC-000012», «la venta FV-000034» o, sin referencia, un movimiento de caja */
export function treasuryOriginDescription(doc: TreasuryDocumentDto): string {
  const type = doc.referenceDocumentType;
  if (!type) return 'un movimiento registrado directamente en caja o bancos';
  const label = TREASURY_REFERENCE_LABELS[type] ?? `el documento ${type}`;
  // La anulación de un recibo o egreso guarda el id interno: no se muestra
  if (type === 'TREASURY_DOCUMENT_CANCEL' || !doc.referenceDocumentId) return label;
  return `${label} ${doc.referenceDocumentId}`;
}

export function treasuryDocumentActions(
  doc: TreasuryDocumentDto,
  hasPermission: (permission: string) => boolean,
): TreasuryDocumentActions {
  const none = { canAnnul: false, canCorrect: false };
  if (doc.status === 'ANULADO') {
    return {
      ...none,
      restriction:
        'Documento anulado: no admite cambios. Su historial y el motivo de la anulación se conservan.',
      source: null,
    };
  }
  if (doc.origin === 'AUTOMATICO') {
    const type = doc.referenceDocumentType ?? '';
    const page = SOURCE_PAGES[type] ?? (type ? null : { label: 'Ir a caja', to: '/cash' });
    return {
      ...none,
      restriction: `Lo generó ${treasuryOriginDescription(doc)}. Solo se imprime aquí: se corrige o anula desde ese documento.`,
      source: page,
    };
  }

  const isReceipt = doc.documentType === 'RECIBO_CAJA';
  const annulPermission = isReceipt
    ? SYSTEM_PERMISSIONS.CASH_RECEIPTS_ANNUL
    : SYSTEM_PERMISSIONS.DISBURSEMENTS_ANNUL;
  if (!hasPermission(annulPermission)) {
    return {
      ...none,
      restriction: `Anular o corregir exige el permiso «${isReceipt ? 'Anular recibos de caja' : 'Anular comprobantes de egreso'}» (${annulPermission}).`,
      source: null,
    };
  }
  if (doc.origin === 'MANUAL' && !hasPermission(SYSTEM_PERMISSIONS.ACCOUNTING_READ)) {
    return {
      ...none,
      restriction:
        'Este documento se registró contra una cuenta contable elegida a mano: anularlo o corregirlo exige además el permiso de contabilidad.',
      source: null,
    };
  }
  if (doc.origin === 'MANUAL') {
    // Anular un manual mueve dinero directamente: exige el permiso del auxiliar afectado
    const bank = doc.paymentMethod === 'TRANSFERENCIA';
    const ledgerPermission = bank
      ? SYSTEM_PERMISSIONS.TREASURY_MANAGE
      : SYSTEM_PERMISSIONS.CASH_MOVEMENTS;
    if (!hasPermission(ledgerPermission)) {
      return {
        ...none,
        restriction: `Anularlo devuelve el dinero ${bank ? 'al banco' : 'a caja'} y exige el permiso para mover dinero ${bank ? 'en bancos' : 'en caja'} (${ledgerPermission}).`,
        source: null,
      };
    }
  }

  const createPermission =
    doc.origin === 'CARTERA'
      ? SYSTEM_PERMISSIONS.CASH_RECEIPTS_COLLECT
      : isReceipt
        ? SYSTEM_PERMISSIONS.CASH_RECEIPTS_MANUAL
        : SYSTEM_PERMISSIONS.DISBURSEMENTS_CREATE;
  if (!hasPermission(createPermission)) {
    return {
      canAnnul: true,
      canCorrect: false,
      restriction: `Puedes anularlo. Corregirlo emite un documento de reemplazo y exige además el permiso para registrarlo (${createPermission}).`,
      source: null,
    };
  }
  return { canAnnul: true, canCorrect: true, restriction: null, source: null };
}
