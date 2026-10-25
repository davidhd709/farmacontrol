import { InventoryControlMode, PurchaseDto, PurchaseLineDto } from '@farmacia/contracts';
import { PurchaseValidationException } from './purchase.exceptions';

export interface CreatePurchaseLineProps {
  id?: string;
  productId: string;
  productName?: string;
  presentationId?: string | null;
  presentationName?: string | null;
  lotId?: string;
  lotNumber?: string | null;
  expirationDate?: Date | null;
  locationId?: string;
  controlMode?: InventoryControlMode;
  quantityCommercial: number;
  conversionFactor: number;
  quantityBaseUnits?: number;
  unitCost: number;
  subtotal?: number;
  createdAt?: Date;
}

export interface ReconstitutePurchaseLineProps {
  id: string;
  purchaseId: string;
  productId: string;
  productName?: string;
  presentationId: string | null;
  presentationName?: string | null;
  lotId: string;
  lotNumber: string | null;
  expirationDate: Date | null;
  locationId?: string;
  controlMode?: InventoryControlMode;
  quantityCommercial: number;
  conversionFactor: number;
  quantityBaseUnits: number;
  unitCost: number;
  subtotal: number;
  vatRate?: number;
  vatAmount?: number;
  taxSnapshot?: unknown;
  createdAt: Date;
}

export class PurchaseLine {
  private readonly _id: string;
  private readonly _purchaseId?: string;
  private readonly _productId: string;
  private readonly _productName?: string;
  private readonly _presentationId: string | null;
  private readonly _presentationName?: string | null;
  private _lotId: string;
  private readonly _lotNumber: string | null;
  private readonly _expirationDate: Date | null;
  private readonly _locationId?: string;
  private readonly _controlMode?: InventoryControlMode;
  private readonly _quantityCommercial: number;
  private readonly _conversionFactor: number;
  private readonly _quantityBaseUnits: number;
  private readonly _unitCost: number;
  private readonly _subtotal: number;
  private _vatRate: number;
  private _vatAmount: number;
  private _taxSnapshot: unknown;
  private readonly _createdAt: Date;

  private constructor(props: ReconstitutePurchaseLineProps) {
    this._id = props.id;
    this._purchaseId = props.purchaseId;
    this._productId = props.productId;
    this._productName = props.productName;
    this._presentationId = props.presentationId;
    this._presentationName = props.presentationName;
    this._lotId = props.lotId;
    this._lotNumber = props.lotNumber;
    this._expirationDate = props.expirationDate;
    this._locationId = props.locationId;
    this._controlMode = props.controlMode;
    this._quantityCommercial = props.quantityCommercial;
    this._conversionFactor = props.conversionFactor;
    this._quantityBaseUnits = props.quantityBaseUnits;
    this._unitCost = props.unitCost;
    this._subtotal = props.subtotal;
    this._vatRate = props.vatRate ?? 0;
    this._vatAmount = props.vatAmount ?? 0;
    this._taxSnapshot = props.taxSnapshot ?? null;
    this._createdAt = props.createdAt;
  }

  public static create(props: CreatePurchaseLineProps): PurchaseLine {
    if (!props.productId) {
      throw new PurchaseValidationException('El producto es obligatorio en cada línea de compra');
    }
    if (props.expirationDate && isNaN(props.expirationDate.getTime())) {
      throw new PurchaseValidationException('La fecha de vencimiento no es válida');
    }

    if (props.quantityCommercial <= 0) {
      throw new PurchaseValidationException(
        'La cantidad comercial debe ser estrictamente mayor a 0',
      );
    }
    if (props.conversionFactor <= 0) {
      throw new PurchaseValidationException('El factor de conversión debe ser mayor a 0');
    }
    if (props.unitCost < 0) {
      throw new PurchaseValidationException('El costo unitario no puede ser negativo');
    }

    const exactBaseUnits = props.quantityCommercial * props.conversionFactor;
    const quantityBaseUnits = props.quantityBaseUnits ?? Math.round(exactBaseUnits);
    // El inventario se lleva en unidades base enteras: no se redondea en silencio
    if (
      props.quantityBaseUnits === undefined &&
      Math.abs(exactBaseUnits - quantityBaseUnits) > 1e-6
    ) {
      throw new PurchaseValidationException(
        `La cantidad ${props.quantityCommercial} con factor ${props.conversionFactor} no equivale a unidades base enteras.`,
      );
    }

    if (quantityBaseUnits <= 0) {
      throw new PurchaseValidationException(
        'La cantidad en unidades base calculada debe ser mayor a 0',
      );
    }

    const subtotal =
      props.subtotal ?? Math.round(props.quantityCommercial * props.unitCost * 100) / 100;

    const now = new Date();
    return new PurchaseLine({
      id: props.id ?? crypto.randomUUID(),
      purchaseId: '',
      productId: props.productId,
      productName: props.productName,
      presentationId: props.presentationId ?? null,
      presentationName: props.presentationName ?? null,
      lotId: props.lotId ?? crypto.randomUUID(),
      lotNumber: props.lotNumber?.trim().toUpperCase() || null,
      expirationDate: props.expirationDate ?? null,
      locationId: props.locationId,
      controlMode: props.controlMode,
      quantityCommercial: props.quantityCommercial,
      conversionFactor: props.conversionFactor,
      quantityBaseUnits,
      unitCost: props.unitCost,
      subtotal,
      createdAt: props.createdAt ?? now,
    });
  }

  public static reconstitute(props: ReconstitutePurchaseLineProps): PurchaseLine {
    return new PurchaseLine(props);
  }

  public setLotId(lotId: string): void {
    this._lotId = lotId;
  }

  /** F6: IVA de la línea calculado por el motor tributario, con su instantánea */
  public applyTaxes(vatRate: number, vatAmount: number, taxSnapshot: unknown): void {
    this._vatRate = vatRate;
    this._vatAmount = vatAmount;
    this._taxSnapshot = taxSnapshot;
  }
  public get vatRate(): number {
    return this._vatRate;
  }
  public get vatAmount(): number {
    return this._vatAmount;
  }
  public get taxSnapshot(): unknown {
    return this._taxSnapshot;
  }

  public get id(): string {
    return this._id;
  }
  public get purchaseId(): string | undefined {
    return this._purchaseId;
  }
  public get productId(): string {
    return this._productId;
  }
  public get productName(): string | undefined {
    return this._productName;
  }
  public get presentationId(): string | null {
    return this._presentationId;
  }
  public get presentationName(): string | null | undefined {
    return this._presentationName;
  }
  public get lotId(): string {
    return this._lotId;
  }
  public get lotNumber(): string | null {
    return this._lotNumber;
  }
  public get expirationDate(): Date | null {
    return this._expirationDate;
  }
  public get locationId(): string | undefined {
    return this._locationId;
  }
  public get controlMode(): InventoryControlMode | undefined {
    return this._controlMode;
  }
  public get quantityCommercial(): number {
    return this._quantityCommercial;
  }
  public get conversionFactor(): number {
    return this._conversionFactor;
  }
  public get quantityBaseUnits(): number {
    return this._quantityBaseUnits;
  }
  public get unitCost(): number {
    return this._unitCost;
  }
  public get subtotal(): number {
    return this._subtotal;
  }
  public get createdAt(): Date {
    return this._createdAt;
  }

  public toDto(): PurchaseLineDto {
    return {
      id: this._id,
      purchaseId: this._purchaseId ?? '',
      productId: this._productId,
      productName: this._productName,
      presentationId: this._presentationId,
      presentationName: this._presentationName,
      lotId: this._lotId,
      lotNumber: this._lotNumber,
      expirationDate: this._expirationDate?.toISOString().split('T')[0] ?? null,
      quantityCommercial: this._quantityCommercial.toFixed(4),
      quantityBaseUnits: this._quantityBaseUnits,
      unitCost: this._unitCost.toFixed(2),
      subtotal: this._subtotal.toFixed(2),
      vatRate: this._vatRate.toFixed(2),
      vatAmount: this._vatAmount.toFixed(2),
      createdAt: this._createdAt.toISOString(),
    };
  }
}

/** F6: desglose tributario de la factura de compra, en unidades monetarias con dos decimales */
export interface PurchaseTaxTotals {
  subtotal: number;
  vatTotal: number;
  withholdingIncome: number;
  withholdingVat: number;
  withholdingIca: number;
  /** IVA descontable (empresa responsable) o mayor costo del inventario; solo al registrar */
  vatDeductible?: boolean;
  /** Detalle de las retenciones practicadas (instantánea del motor) */
  withholdings?: unknown;
}

export interface CreatePurchaseProps {
  id?: string;
  supplierId: string;
  supplierName?: string;
  supplierTaxId?: string;
  invoiceNumber: string;
  purchaseDate: Date;
  dueDate?: Date | null;
  paymentCondition?: string | null;
  status?: string;
  notes?: string | null;
  receivedByUserId?: string | null;
  receivedByUsername?: string | null;
  lines: PurchaseLine[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ReconstitutePurchaseProps {
  id: string;
  supplierId: string;
  supplierName?: string;
  supplierTaxId?: string;
  invoiceNumber: string;
  purchaseDate: Date;
  dueDate?: Date | null;
  paymentCondition?: string | null;
  totalAmount: number;
  /** F6: null en compras registradas sin el motor tributario */
  taxTotals?: PurchaseTaxTotals | null;
  status: string;
  notes: string | null;
  receivedByUserId: string | null;
  receivedByUsername?: string | null;
  lines: PurchaseLine[];
  createdAt: Date;
  updatedAt: Date;
}

export class Purchase {
  private readonly _id: string;
  private readonly _supplierId: string;
  private readonly _supplierName?: string;
  private readonly _supplierTaxId?: string;
  private readonly _invoiceNumber: string;
  private readonly _purchaseDate: Date;
  private readonly _dueDate?: Date | null;
  private readonly _paymentCondition?: string | null;
  private _totalAmount: number;
  private _taxTotals: PurchaseTaxTotals | null;
  private readonly _status: string;
  private readonly _notes: string | null;
  private readonly _receivedByUserId: string | null;
  private readonly _receivedByUsername?: string | null;
  private readonly _lines: PurchaseLine[];
  private readonly _createdAt: Date;
  private readonly _updatedAt: Date;

  private constructor(props: ReconstitutePurchaseProps) {
    this._id = props.id;
    this._supplierId = props.supplierId;
    this._supplierName = props.supplierName;
    this._supplierTaxId = props.supplierTaxId;
    this._invoiceNumber = props.invoiceNumber;
    this._purchaseDate = props.purchaseDate;
    this._dueDate = props.dueDate;
    this._paymentCondition = props.paymentCondition;
    this._totalAmount = props.totalAmount;
    this._taxTotals = props.taxTotals ?? null;
    this._status = props.status;
    this._notes = props.notes;
    this._receivedByUserId = props.receivedByUserId;
    this._receivedByUsername = props.receivedByUsername;
    this._lines = props.lines;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  public static create(props: CreatePurchaseProps): Purchase {
    if (!props.supplierId) {
      throw new PurchaseValidationException('El proveedor es obligatorio para registrar la compra');
    }
    if (!props.invoiceNumber || !props.invoiceNumber.trim()) {
      throw new PurchaseValidationException('El número de factura o comprobante es obligatorio');
    }
    if (!props.purchaseDate || isNaN(props.purchaseDate.getTime())) {
      throw new PurchaseValidationException('La fecha de compra es obligatoria');
    }
    if (!props.lines || props.lines.length === 0) {
      throw new PurchaseValidationException(
        'La compra debe contener al menos una línea de producto',
      );
    }

    const totalAmount =
      Math.round(props.lines.reduce((sum, line) => sum + line.subtotal, 0) * 100) / 100;

    const now = new Date();
    return new Purchase({
      id: props.id ?? crypto.randomUUID(),
      supplierId: props.supplierId,
      supplierName: props.supplierName,
      supplierTaxId: props.supplierTaxId,
      invoiceNumber: props.invoiceNumber.trim().toUpperCase(),
      purchaseDate: props.purchaseDate,
      dueDate: props.dueDate,
      paymentCondition: props.paymentCondition,
      totalAmount,
      status: props.status ?? 'RECEIVED',
      notes: props.notes ? props.notes.trim() : null,
      receivedByUserId: props.receivedByUserId ?? null,
      receivedByUsername: props.receivedByUsername ?? null,
      lines: props.lines,
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
    });
  }

  public static reconstitute(props: ReconstitutePurchaseProps): Purchase {
    return new Purchase(props);
  }

  public get id(): string {
    return this._id;
  }
  public get supplierId(): string {
    return this._supplierId;
  }
  public get supplierName(): string | undefined {
    return this._supplierName;
  }
  public get supplierTaxId(): string | undefined {
    return this._supplierTaxId;
  }
  public get invoiceNumber(): string {
    return this._invoiceNumber;
  }
  public get purchaseDate(): Date {
    return this._purchaseDate;
  }
  public get dueDate(): Date | null | undefined {
    return this._dueDate;
  }
  public get paymentCondition(): string | null | undefined {
    return this._paymentCondition;
  }
  public get totalAmount(): number {
    return this._totalAmount;
  }
  public get taxTotals(): PurchaseTaxTotals | null {
    return this._taxTotals;
  }
  /** Lo que se le debe al proveedor: total de la factura menos las retenciones practicadas */
  public get payableAmount(): number {
    const t = this._taxTotals;
    if (!t) return this._totalAmount;
    return (
      Math.round(
        (this._totalAmount - t.withholdingIncome - t.withholdingVat - t.withholdingIca) * 100,
      ) / 100
    );
  }

  /** F6: aplica el resultado del motor tributario; el total pasa a ser subtotal + IVA */
  public applyTaxes(totals: PurchaseTaxTotals): void {
    this._taxTotals = totals;
    this._totalAmount = Math.round((totals.subtotal + totals.vatTotal) * 100) / 100;
  }
  public get status(): string {
    return this._status;
  }
  public get notes(): string | null {
    return this._notes;
  }
  public get receivedByUserId(): string | null {
    return this._receivedByUserId;
  }
  public get receivedByUsername(): string | null | undefined {
    return this._receivedByUsername;
  }
  public get lines(): PurchaseLine[] {
    return [...this._lines];
  }
  public get createdAt(): Date {
    return this._createdAt;
  }
  public get updatedAt(): Date {
    return this._updatedAt;
  }

  public toDto(): PurchaseDto {
    return {
      id: this._id,
      supplierId: this._supplierId,
      supplierName: this._supplierName,
      supplierTaxId: this._supplierTaxId,
      invoiceNumber: this._invoiceNumber,
      purchaseDate: this._purchaseDate.toISOString().split('T')[0],
      dueDate: this._dueDate ? this._dueDate.toISOString().split('T')[0] : null,
      paymentCondition: this._paymentCondition ?? null,
      totalAmount: this._totalAmount.toFixed(2),
      subtotal: this._taxTotals ? this._taxTotals.subtotal.toFixed(2) : null,
      vatTotal: (this._taxTotals?.vatTotal ?? 0).toFixed(2),
      withholdingIncome: (this._taxTotals?.withholdingIncome ?? 0).toFixed(2),
      withholdingVat: (this._taxTotals?.withholdingVat ?? 0).toFixed(2),
      withholdingIca: (this._taxTotals?.withholdingIca ?? 0).toFixed(2),
      payableAmount: this.payableAmount.toFixed(2),
      status: this._status,
      notes: this._notes,
      receivedByUserId: this._receivedByUserId,
      receivedByUsername: this._receivedByUsername,
      lines: this._lines.map((line) => line.toDto()),
      createdAt: this._createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
    };
  }
}
