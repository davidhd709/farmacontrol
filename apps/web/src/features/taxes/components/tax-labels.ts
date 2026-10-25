import type { IcaActivity, TaxType } from '@farmacia/contracts';

export const TAX_TYPE_LABELS: Record<TaxType, string> = {
  IVA: 'IVA',
  INC: 'Impuesto al consumo (INC)',
  RETEFUENTE: 'Retención en la fuente',
  RETEIVA: 'Retención de IVA',
  RETEICA: 'Retención de ICA',
};

export const ICA_ACTIVITY_LABELS: Record<IcaActivity, string> = {
  INDUSTRIAL: 'Industrial',
  COMERCIAL: 'Comercial',
  SERVICIOS: 'Servicios',
};

export const REVIEW_PENDING_TEXT =
  'El contenido del catálogo normativo está pendiente de revisión por el asesor tributario. Esa revisión es condición para usar el motor tributario en producción.';
