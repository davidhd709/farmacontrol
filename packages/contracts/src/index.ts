/**
 * @farmacia/contracts
 * Tipos e interfaces compartidos entre aplicaciones (API, Web, Worker).
 * Sin lógica de negocio ni dependencias de infraestructura.
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
    correlationId?: string;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface HealthStatus {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  service: string;
}

export const SYSTEM_ROLES = {
  ADMIN: 'admin',
  SUPERVISOR: 'supervisor',
  CAJERO: 'cajero',
  INVENTARIO: 'inventario',
  COMPRAS: 'compras',
  CARTERA: 'cartera',
} as const;

export type SystemRole = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

export const SYSTEM_PERMISSIONS = {
  // Usuarios y roles
  USERS_READ: 'users:read',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_DELETE: 'users:delete',
  ROLES_READ: 'roles:read',
  ROLES_ASSIGN: 'roles:assign',

  // Catálogo
  CATEGORIES_READ: 'categories:read',
  CATEGORIES_MANAGE: 'categories:manage',
  PRODUCTS_READ: 'products:read',
  PRODUCTS_MANAGE: 'products:manage',

  // Inventario y lotes
  INVENTORY_READ: 'inventory:read',
  INVENTORY_ADJUST: 'inventory:adjust',
  INVENTORY_MOVEMENTS_READ: 'inventory:movements:read',
  INVENTORY_LOTS_MANAGE: 'inventory:lots:manage',

  // Ventas y POS
  SALES_READ: 'sales:read',
  SALES_CREATE: 'sales:create',
  SALES_CANCEL: 'sales:cancel',

  // Caja
  CASH_READ: 'cash:read',
  CASH_OPEN: 'cash:open',
  CASH_CLOSE: 'cash:close',
  CASH_MOVEMENTS: 'cash:movements',

  // Compras
  PURCHASES_READ: 'purchases:read',
  PURCHASES_CREATE: 'purchases:create',
  PURCHASES_RECEIVE: 'purchases:receive',

  // Clientes y proveedores
  CUSTOMERS_READ: 'customers:read',
  CUSTOMERS_MANAGE: 'customers:manage',
  SUPPLIERS_READ: 'suppliers:read',
  SUPPLIERS_MANAGE: 'suppliers:manage',

  // Cartera
  RECEIVABLES_READ: 'receivables:read',
  RECEIVABLES_MANAGE: 'receivables:manage',
  PAYABLES_READ: 'payables:read',
  PAYABLES_MANAGE: 'payables:manage',

  // Reportes y auditoría
  REPORTS_READ: 'reports:read',
  AUDIT_READ: 'audit:read',

  // Alertas y procesos en segundo plano
  ALERTS_READ: 'alerts:read',
  ALERTS_MANAGE: 'alerts:manage',

  // Resiliencia y administración
  BACKUPS_MANAGE: 'backups:manage',
} as const;

export type SystemPermission = (typeof SYSTEM_PERMISSIONS)[keyof typeof SYSTEM_PERMISSIONS];

export interface RoleDto {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface PermissionDto {
  id: string;
  name: string;
  description: string | null;
}

export interface UserRbacContext {
  roles: string[];
  permissions: string[];
}

export interface AuthUserDto {
  id: string;
  username: string;
  isActive: boolean;
  roles: string[];
  permissions: string[];
}

export interface SystemUserListItemDto {
  id: string;
  username: string;
  isActive: boolean;
  createdAt: string;
  roles: string[];
}

export interface SystemRoleItemDto {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface CreateSystemUserDto {
  username: string;
  password: string;
  roles: string[];
  isActive?: boolean;
}

export interface UpdateSystemUserStatusDto {
  isActive: boolean;
}

export interface UpdateSystemUserRolesDto {
  roles: string[];
}

export interface AuditEventDto {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  correlationId: string | null;
  createdAt: string;
}

export interface RecordAuditEventPayload {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  correlationId?: string | null;
}

export interface CategoryDto {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryPayload {
  name: string;
  description?: string | null;
}

export interface UpdateCategoryPayload {
  name?: string;
  description?: string | null;
  isActive?: boolean;
}

export interface CategoryQueryFilters {
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ProductDto {
  id: string;
  categoryId: string;
  categoryName?: string;
  code: string;
  barcode: string | null;
  name: string;
  genericName: string | null;
  concentration: string | null;
  sanitaryRegistry: string | null;
  manufacturer: string | null;
  description: string | null;
  requiresLotControl: boolean;
  prescriptionRequired: boolean;
  baseUnit: string;
  basePrice: string;
  baseCost: string;
  isActive: boolean;
  presentations?: ProductPresentationDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductPayload {
  categoryId: string;
  code: string;
  barcode?: string | null;
  name: string;
  genericName?: string | null;
  concentration?: string | null;
  sanitaryRegistry?: string | null;
  manufacturer?: string | null;
  description?: string | null;
  requiresLotControl?: boolean;
  prescriptionRequired?: boolean;
  baseUnit?: string;
  basePrice: number | string;
  baseCost?: number | string;
}

export interface UpdateProductPayload {
  categoryId?: string;
  code?: string;
  barcode?: string | null;
  name?: string;
  genericName?: string | null;
  concentration?: string | null;
  sanitaryRegistry?: string | null;
  manufacturer?: string | null;
  description?: string | null;
  requiresLotControl?: boolean;
  prescriptionRequired?: boolean;
  baseUnit?: string;
  basePrice?: number | string;
  baseCost?: number | string;
  isActive?: boolean;
}

export interface ProductQueryFilters {
  categoryId?: string;
  search?: string;
  requiresLotControl?: boolean;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ProductPresentationDto {
  id: string;
  productId: string;
  name: string;
  barcode: string | null;
  conversionFactor: number;
  price: string;
  cost: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductPresentationPayload {
  productId: string;
  name: string;
  barcode?: string | null;
  conversionFactor: number;
  price: number | string;
  cost?: number | string;
  isDefault?: boolean;
}

export interface UpdateProductPresentationPayload {
  name?: string;
  barcode?: string | null;
  conversionFactor?: number;
  price?: number | string;
  cost?: number | string;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface LocationDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLocationPayload {
  code: string;
  name: string;
  description?: string | null;
  isDefault?: boolean;
}

export interface InventoryLotDto {
  id: string;
  productId: string;
  locationId: string;
  lotNumber: string;
  expirationDate: string; // ISO date YYYY-MM-DD
  currentQuantity: number; // En unidades base
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  product?: {
    id: string;
    code: string;
    name: string;
    baseUnit: string;
  };
  location?: {
    id: string;
    code: string;
    name: string;
  };
}

export interface CreateInventoryLotPayload {
  productId: string;
  locationId: string;
  lotNumber: string;
  expirationDate: string;
  initialQuantity?: number;
}

export interface InventoryLotQueryFilters {
  productId?: string;
  locationId?: string;
  lotNumber?: string;
  expiringBefore?: string;
  hasStockOnly?: boolean;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export type InventoryMovementType =
  | 'ENTRADA_COMPRA'
  | 'SALIDA_VENTA'
  | 'AJUSTE_POSITIVO'
  | 'AJUSTE_NEGATIVO'
  | 'DEVOLUCION_CLIENTE'
  | 'DEVOLUCION_PROVEEDOR'
  | 'TRASLADO_ENTRADA'
  | 'TRASLADO_SALIDA';

export interface InventoryMovementDto {
  id: string;
  movementType: InventoryMovementType;
  productId: string;
  lotId: string;
  presentationId?: string | null;
  quantityBaseUnits: number;
  presentationFactorHistorical: number;
  quantityCommercial?: string | null;
  balanceAfterBaseUnits: number;
  referenceDocumentType?: string | null;
  referenceDocumentId?: string | null;
  notes?: string | null;
  createdByUserId?: string | null;
  createdAt: string;
  product?: {
    id: string;
    code: string;
    name: string;
    baseUnit: string;
  };
  lot?: {
    id: string;
    lotNumber: string;
    expirationDate: string;
  };
  presentation?: {
    id: string;
    name: string;
    conversionFactor: number;
  } | null;
}

export interface RecordInventoryMovementPayload {
  movementType: InventoryMovementType;
  productId: string;
  lotId: string;
  presentationId?: string;
  quantityBaseUnits: number;
  presentationFactorHistorical?: number;
  quantityCommercial?: number | string;
  referenceDocumentType?: string;
  referenceDocumentId?: string;
  notes?: string;
}

export interface InventoryMovementQueryFilters {
  productId?: string;
  lotId?: string;
  movementType?: InventoryMovementType;
  fromDate?: string;
  toDate?: string;
  referenceDocumentId?: string;
  page?: number;
  pageSize?: number;
}

export interface FefoAllocationItem {
  lotId: string;
  lotNumber: string;
  expirationDate: string;
  quantityBaseUnits: number;
}

export interface FefoAllocationResult {
  productId: string;
  totalAllocated: number;
  allocations: FefoAllocationItem[];
}

export interface AllocateFefoPayload {
  productId: string;
  quantityBaseUnits: number;
  locationId?: string;
}

export type InventoryAdjustmentType = 'INCREMENTO' | 'DECREMENTO';

export interface AdjustInventoryPayload {
  productId: string;
  lotId: string;
  adjustmentType: InventoryAdjustmentType;
  quantityBaseUnits: number;
  reason: string; // Justificación obligatoria
  notes?: string;
}

export interface SupplierDto {
  id: string;
  taxId: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupplierPayload {
  taxId: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

export interface UpdateSupplierPayload {
  taxId?: string;
  name?: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  isActive?: boolean;
}

export interface SupplierQueryFilters {
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface PurchaseLineDto {
  id: string;
  purchaseId: string;
  productId: string;
  productName?: string;
  presentationId?: string | null;
  presentationName?: string | null;
  lotId: string;
  lotNumber: string;
  expirationDate: string;
  quantityCommercial: string;
  quantityBaseUnits: number;
  unitCost: string;
  subtotal: string;
  createdAt: string;
}

export interface PurchaseDto {
  id: string;
  supplierId: string;
  supplierName?: string;
  supplierTaxId?: string;
  invoiceNumber: string;
  purchaseDate: string;
  dueDate?: string | null;
  paymentCondition?: string | null;
  totalAmount: string;
  status: string;
  notes?: string | null;
  receivedByUserId?: string | null;
  receivedByUsername?: string | null;
  lines: PurchaseLineDto[];
  createdAt: string;
  updatedAt: string;
}

export interface ReceivePurchaseLinePayload {
  productId: string;
  presentationId?: string | null;
  lotNumber: string;
  expirationDate: string; // 'YYYY-MM-DD'
  quantityCommercial: number | string;
  unitCost: number | string;
  locationId?: string;
}

export interface ReceivePurchasePayload {
  supplierId: string;
  invoiceNumber: string;
  purchaseDate: string; // 'YYYY-MM-DD'
  dueDate?: string | null; // 'YYYY-MM-DD'
  paymentCondition?: string | null; // 'CONTADO' | 'CREDITO'
  notes?: string | null;
  lines: ReceivePurchaseLinePayload[];
}

export interface PurchaseQueryFilters {
  supplierId?: string;
  invoiceNumber?: string;
  fromDate?: string;
  toDate?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export * from './cash.dto';
export * from './customers.dto';
export * from './sales.dto';

// ===== RECEIVABLES (Cuentas por Cobrar) =====

export type ReceivableStatus = 'PENDIENTE' | 'PAGADA' | 'ANULADA';

export interface ReceivablePaymentDto {
  id: string;
  receivableId: string;
  amount: string;
  paymentMethod: string;
  notes: string | null;
  createdByUserId: string;
  createdAt: string;
}

export interface ReceivableDto {
  id: string;
  saleId: string;
  customerId: string;
  customerName?: string;
  invoiceNumber?: string;
  totalAmount: string;
  amountPaid: string;
  balance: string;
  status: ReceivableStatus;
  dueDate: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  payments?: ReceivablePaymentDto[];
}

export interface RegisterReceivablePaymentPayload {
  amount: number | string;
  paymentMethod?: string;
  notes?: string | null;
}

export interface ReceivableQueryFilters {
  customerId?: string;
  status?: ReceivableStatus;
  fromDate?: string;
  toDate?: string;
  overdueOnly?: boolean;
  page?: number;
  pageSize?: number;
}

// ===== PAYABLES (Cuentas por Pagar) =====

export type PayableStatus = 'PENDIENTE' | 'PAGADA' | 'ANULADA';

export interface PayablePaymentDto {
  id: string;
  payableId: string;
  amount: string;
  paymentMethod: string;
  notes: string | null;
  createdByUserId: string;
  createdAt: string;
}

export interface PayableDto {
  id: string;
  purchaseId: string;
  supplierId: string;
  supplierName?: string;
  invoiceNumber?: string;
  totalAmount: string;
  amountPaid: string;
  balance: string;
  status: PayableStatus;
  dueDate: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  payments?: PayablePaymentDto[];
}

export interface RegisterPayablePaymentPayload {
  amount: number | string;
  paymentMethod?: string;
  notes?: string | null;
}

export interface PayableQueryFilters {
  supplierId?: string;
  status?: PayableStatus;
  fromDate?: string;
  toDate?: string;
  overdueOnly?: boolean;
  page?: number;
  pageSize?: number;
}

// ===== ALERTS & BACKGROUND JOBS (ÉPICA 08) =====

export type ExpirationSeverity = 'VENCIDO' | 'CRITICO' | 'ALERTA' | 'PROXIMO' | 'NORMAL';

export interface InventoryAlertDto {
  id: string;
  lotId: string;
  lotNumber: string;
  productId: string;
  productCode: string;
  productName: string;
  categoryName?: string;
  locationId?: string;
  locationName?: string;
  expirationDate: string;
  daysRemaining: number;
  severity: ExpirationSeverity;
  currentQuantity: number;
  baseUnit?: string;
  isResolved: boolean;
  resolvedAt: string | null;
  lastEvaluatedAt: string;
  createdAt: string;
}

export interface AlertsSummaryDto {
  totalActive: number;
  vencidos: number;       // <= 0 días
  criticos: number;       // 1 - 30 días
  alertas: number;        // 31 - 60 días
  proximos: number;       // 61 - 90 días
  lastEvaluatedAt?: string;
}

export interface AlertsQueryFilters {
  severity?: ExpirationSeverity;
  search?: string;
  locationId?: string;
  isResolved?: boolean;
  page?: number;
  pageSize?: number;
}

export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface BackgroundJobDto {
  id: string;
  jobType: string;
  payload?: unknown;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationResultDto {
  evaluatedLots: number;
  createdAlerts: number;
  updatedAlerts: number;
  resolvedAlerts: number;
  timestamp: string;
}

// ===== REPORTS & EXPORTS (ÉPICA 09 - HU-023) =====

export interface InventoryValuationItemDto {
  productId: string;
  productCode: string;
  productName: string;
  categoryName: string;
  baseUnit: string;
  currentStock: number;
  baseCost: number;
  basePrice: number;
  totalCostValue: number;
  totalPriceValue: number;
  activeLotsCount: number;
}

export interface InventoryValuationReportDto {
  generatedAt: string;
  totalProducts: number;
  totalUnits: number;
  totalCostValuation: number;
  totalPriceValuation: number;
  items: InventoryValuationItemDto[];
}

export interface ExpirationReportItemDto {
  lotId: string;
  lotNumber: string;
  productId: string;
  productCode: string;
  productName: string;
  categoryName: string;
  expirationDate: string;
  daysRemaining: number;
  severity: ExpirationSeverity;
  currentQuantity: number;
  baseUnit: string;
  locationName: string;
}

export interface ExpirationsReportDto {
  generatedAt: string;
  totalLots: number;
  vencidosCount: number;
  criticosCount: number;
  alertasCount: number;
  proximosCount: number;
  items: ExpirationReportItemDto[];
}

export interface SalesReportItemDto {
  saleId: string;
  invoiceNumber: string;
  soldAt: string;
  customerName: string;
  customerDocument: string;
  paymentMethod: string;
  status: string;
  itemsCount: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
}

export interface SalesReportDto {
  generatedAt: string;
  fromDate: string | null;
  toDate: string | null;
  totalSales: number;
  totalAmount: number;
  byPaymentMethod: Record<string, number>;
  items: SalesReportItemDto[];
}

export interface CashMovementReportItemDto {
  id: string;
  createdAt: string;
  movementType: 'IN' | 'OUT';
  concept: string;
  amount: number;
  paymentMethod: string;
  referenceDocumentType: string | null;
  referenceDocumentId: string | null;
  userName: string | null;
}

export interface CashSummaryReportDto {
  generatedAt: string;
  fromDate: string | null;
  toDate: string | null;
  totalMovements: number;
  totalInflows: number;
  totalOutflows: number;
  netCashFlow: number;
  items: CashMovementReportItemDto[];
}

export interface ReportDateFilter {
  fromDate?: string;
  toDate?: string;
  format?: 'json' | 'csv';
}

// ===== BACKUPS & RESILIENCE (ÉPICA 10 - HU-024) =====

export interface BackupFileDto {
  filename: string;
  filepath?: string;
  createdAt: string;
  sizeBytes: number;
  sha256: string;
  verified: boolean;
  pgVersion?: string;
}

export interface BackupSummaryDto {
  totalBackups: number;
  lastBackupAt: string | null;
  lastBackupFilename: string | null;
  lastBackupSizeBytes: number | null;
  isHealthyRpo: boolean;
  hoursSinceLastBackup: number | null;
  backupDirectory: string;
  items: BackupFileDto[];
}

export interface CreateBackupResultDto {
  success: boolean;
  message: string;
  backup?: BackupFileDto;
}

export interface VerifyBackupResultDto {
  filename: string;
  verified: boolean;
  sha256Match: boolean;
  message: string;
}

