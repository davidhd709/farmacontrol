/**
 * Empresa y configuración contable (ADR-006, F3). La empresa es la dueña de las políticas
 * contables; en modo dedicado existe una sola empresa activa.
 */

/** Perfiles sectoriales disponibles. De entrada solo farmacia (ADR-006). */
export const SECTOR_PROFILES = ['PHARMACY'] as const;
export type SectorProfile = (typeof SECTOR_PROFILES)[number];

/** Modos con los que se controla la salida de las existencias. */
export const INVENTORY_CONTROL_MODES = [
  'SERVICE',
  'SIMPLE',
  'LOT',
  'LOT_EXPIRY',
  'SERIAL',
] as const;
export type InventoryControlMode = (typeof INVENTORY_CONTROL_MODES)[number];

export interface SectorProfileRules {
  defaultControlMode: InventoryControlMode;
  allowedControlModes: readonly InventoryControlMode[];
  prescriptionRequiredControlMode: InventoryControlMode;
}

/** Reglas de catálogo estáticas por sector (ADR-006, F4). */
export const SECTOR_PROFILE_RULES: Record<SectorProfile, SectorProfileRules> = {
  PHARMACY: {
    defaultControlMode: 'LOT_EXPIRY',
    allowedControlModes: INVENTORY_CONTROL_MODES,
    prescriptionRequiredControlMode: 'LOT_EXPIRY',
  },
};

export interface ProductSettingsDto {
  sectorProfile: SectorProfile;
  defaultControlMode: InventoryControlMode;
  allowedControlModes: InventoryControlMode[];
  prescriptionRequiredControlMode: InventoryControlMode;
}

/** Métodos de costeo (ADR-006): promedio ponderado, PEPS y costo identificado por existencia (F5). */
export const COSTING_METHODS = ['WEIGHTED_AVERAGE', 'FIFO', 'SPECIFIC_LOT'] as const;
export type CostingMethod = (typeof COSTING_METHODS)[number];
export const AVAILABLE_COSTING_METHODS: readonly CostingMethod[] = COSTING_METHODS;

/** Costo con que se abren las existencias anteriores al submayor (ADR-005). */
export const OPENING_COST_SOURCES = ['LAST_PURCHASE_THEN_CATALOG', 'CATALOG'] as const;
export type OpeningCostSource = (typeof OPENING_COST_SOURCES)[number];

/** Propósito que recibe la diferencia entre el costo de compra devuelto y el promedio. */
export const PURCHASE_RETURN_VARIANCE_PURPOSES = [
  'COST_OF_SALES',
  'INVENTORY_COST_VARIANCE',
] as const;
export type PurchaseReturnVariancePurpose = (typeof PURCHASE_RETURN_VARIANCE_PURPOSES)[number];

/** Tratamiento de unidades recibidas sin costo (bonificaciones). */
export const BONUS_UNITS_TREATMENTS = ['ZERO_COST_IN_AVERAGE'] as const;
export type BonusUnitsTreatment = (typeof BONUS_UNITS_TREATMENTS)[number];

export interface BranchDto {
  id: string;
  code: string;
  name: string;
  address: string | null;
  /** Código DANE del municipio (5 dígitos) */
  municipalityCode: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface CompanyDto {
  id: string;
  legalName: string;
  tradeName: string | null;
  /** NIT sin dígito de verificación */
  taxId: string;
  taxIdCheckDigit: string;
  sectorProfile: SectorProfile;
  address: string | null;
  municipalityCode: string | null;
  email: string | null;
  phone: string | null;
  branches: BranchDto[];
  createdAt: string;
  updatedAt: string;
}

export interface AccountingPolicyDto {
  id: string | null;
  /** YYYY-MM-DD; `null` en los valores por defecto de una instalación sin configurar */
  effectiveFrom: string | null;
  costingMethod: CostingMethod;
  openingCostSource: OpeningCostSource;
  purchaseReturnVariancePurpose: PurchaseReturnVariancePurpose;
  bonusUnitsTreatment: BonusUnitsTreatment;
  reason: string | null;
  createdByName: string | null;
  createdAt: string | null;
  /** `true` cuando la empresa aún no registró políticas y rigen los valores por defecto */
  isDefault: boolean;
}

export interface CompanySettingsDto {
  company: CompanyDto | null;
  currentPolicy: AccountingPolicyDto;
  policyHistory: AccountingPolicyDto[];
  availableCostingMethods: CostingMethod[];
}

export interface SetupCompanyPayload {
  legalName: string;
  tradeName?: string | null;
  taxId: string;
  taxIdCheckDigit: string;
  sectorProfile: SectorProfile;
  address?: string | null;
  municipalityCode?: string | null;
  email?: string | null;
  phone?: string | null;
  branch: { code: string; name: string; address?: string | null; municipalityCode?: string | null };
}

export type UpdateCompanyPayload = Partial<
  Pick<
    SetupCompanyPayload,
    'legalName' | 'tradeName' | 'address' | 'municipalityCode' | 'email' | 'phone'
  >
>;

export interface CreateBranchPayload {
  code: string;
  name: string;
  address?: string | null;
  municipalityCode?: string | null;
}

export interface CreateAccountingPolicyPayload {
  /** YYYY-MM-DD, igual o posterior a hoy: una política nueva no cambia el pasado */
  effectiveFrom: string;
  costingMethod: CostingMethod;
  openingCostSource: OpeningCostSource;
  purchaseReturnVariancePurpose: PurchaseReturnVariancePurpose;
  bonusUnitsTreatment: BonusUnitsTreatment;
  reason: string;
}
