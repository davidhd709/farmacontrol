import {
  SaleStatus,
  SalePaymentMethod,
  SaleDto,
  SaleLineDto,
  SaleLotAllocationDto,
} from '@farmacia/contracts';

export interface SaleLotAllocationProps {
  id: string;
  saleId: string;
  saleLineId: string;
  lotId: string;
  quantityBaseUnits: number;
  lotNumber?: string;
  expirationDate?: string;
  createdAt?: Date;
}

export class SaleLotAllocation {
  private constructor(private readonly props: SaleLotAllocationProps) {}

  public static create(props: {
    id?: string;
    saleId: string;
    saleLineId: string;
    lotId: string;
    quantityBaseUnits: number;
    lotNumber?: string;
    expirationDate?: string;
    createdAt?: Date;
  }): SaleLotAllocation {
    if (props.quantityBaseUnits <= 0) {
      throw new Error('La cantidad de unidades base asignadas del lote debe ser mayor a cero');
    }
    return new SaleLotAllocation({
      id: props.id ?? crypto.randomUUID(),
      saleId: props.saleId,
      saleLineId: props.saleLineId,
      lotId: props.lotId,
      quantityBaseUnits: props.quantityBaseUnits,
      lotNumber: props.lotNumber,
      expirationDate: props.expirationDate,
      createdAt: props.createdAt ?? new Date(),
    });
  }

  public get id(): string {
    return this.props.id;
  }
  public get saleId(): string {
    return this.props.saleId;
  }
  public get saleLineId(): string {
    return this.props.saleLineId;
  }
  public get lotId(): string {
    return this.props.lotId;
  }
  public get quantityBaseUnits(): number {
    return this.props.quantityBaseUnits;
  }
  public get lotNumber(): string | undefined {
    return this.props.lotNumber;
  }
  public get expirationDate(): string | undefined {
    return this.props.expirationDate;
  }

  public toDto(): SaleLotAllocationDto {
    return {
      id: this.props.id,
      lotId: this.props.lotId,
      lotNumber: this.props.lotNumber,
      expirationDate: this.props.expirationDate,
      quantityBaseUnits: this.props.quantityBaseUnits,
    };
  }
}

export interface SaleLineProps {
  id: string;
  saleId: string;
  productId: string;
  productCode?: string;
  productName?: string;
  presentationId?: string | null;
  presentationName?: string | null;
  presentationFactorHistorical: number;
  quantityCommercial: number;
  quantityBaseUnits: number;
  unitPrice: number;
  discount: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  lotAllocations?: SaleLotAllocation[];
  createdAt?: Date;
}

export class SaleLine {
  private constructor(private readonly props: SaleLineProps) {}

  public static create(payload: {
    id?: string;
    saleId: string;
    productId: string;
    productCode?: string;
    productName?: string;
    presentationId?: string | null;
    presentationName?: string | null;
    presentationFactorHistorical?: number;
    quantityCommercial: number;
    unitPrice: number;
    discount?: number;
    taxRate?: number;
    lotAllocations?: SaleLotAllocation[];
    createdAt?: Date;
  }): SaleLine {
    if (payload.quantityCommercial <= 0) {
      throw new Error('La cantidad vendida debe ser mayor a cero');
    }
    if (payload.unitPrice < 0) {
      throw new Error('El precio unitario no puede ser negativo');
    }

    const factor = payload.presentationFactorHistorical ?? 1;
    const quantityBaseUnits = Math.round(payload.quantityCommercial * factor);
    const discount = payload.discount ?? 0;
    const subtotal = Math.max(0, payload.quantityCommercial * payload.unitPrice - discount);
    const taxRate = payload.taxRate ?? 0;
    const taxAmount = Math.round(subtotal * (taxRate / 100) * 100) / 100;
    const total = subtotal + taxAmount;

    return new SaleLine({
      id: payload.id ?? crypto.randomUUID(),
      saleId: payload.saleId,
      productId: payload.productId,
      productCode: payload.productCode,
      productName: payload.productName,
      presentationId: payload.presentationId ?? null,
      presentationName: payload.presentationName ?? null,
      presentationFactorHistorical: factor,
      quantityCommercial: payload.quantityCommercial,
      quantityBaseUnits,
      unitPrice: payload.unitPrice,
      discount,
      subtotal,
      taxRate,
      taxAmount,
      total,
      lotAllocations: payload.lotAllocations ?? [],
      createdAt: payload.createdAt ?? new Date(),
    });
  }

  public static reconstitute(props: SaleLineProps): SaleLine {
    return new SaleLine(props);
  }

  public get id(): string {
    return this.props.id;
  }
  public get saleId(): string {
    return this.props.saleId;
  }
  public get productId(): string {
    return this.props.productId;
  }
  public get productCode(): string | undefined {
    return this.props.productCode;
  }
  public get productName(): string | undefined {
    return this.props.productName;
  }
  public get presentationId(): string | null | undefined {
    return this.props.presentationId;
  }
  public get presentationName(): string | null | undefined {
    return this.props.presentationName;
  }
  public get presentationFactorHistorical(): number {
    return this.props.presentationFactorHistorical;
  }
  public get quantityCommercial(): number {
    return this.props.quantityCommercial;
  }
  public get quantityBaseUnits(): number {
    return this.props.quantityBaseUnits;
  }
  public get unitPrice(): number {
    return this.props.unitPrice;
  }
  public get discount(): number {
    return this.props.discount;
  }
  public get subtotal(): number {
    return this.props.subtotal;
  }
  public get taxRate(): number {
    return this.props.taxRate;
  }
  public get taxAmount(): number {
    return this.props.taxAmount;
  }
  public get total(): number {
    return this.props.total;
  }
  public get lotAllocations(): SaleLotAllocation[] {
    return this.props.lotAllocations ?? [];
  }

  public setLotAllocations(allocations: SaleLotAllocation[]): void {
    this.props.lotAllocations = allocations;
  }

  public toDto(): SaleLineDto {
    return {
      id: this.props.id,
      productId: this.props.productId,
      productCode: this.props.productCode,
      productName: this.props.productName,
      presentationId: this.props.presentationId,
      presentationName: this.props.presentationName,
      presentationFactorHistorical: this.props.presentationFactorHistorical,
      quantityCommercial: this.props.quantityCommercial,
      quantityBaseUnits: this.props.quantityBaseUnits,
      unitPrice: this.props.unitPrice,
      discount: this.props.discount,
      subtotal: this.props.subtotal,
      taxRate: this.props.taxRate,
      taxAmount: this.props.taxAmount,
      total: this.props.total,
      lotAllocations: this.props.lotAllocations?.map((a) => a.toDto()),
    };
  }
}

export interface SaleProperties {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName?: string;
  customerDocument?: string;
  status: SaleStatus;
  paymentMethod: SalePaymentMethod;
  bankAccountId?: string | null;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  amountPaid: number;
  changeGiven: number;
  notes?: string | null;
  createdById: string;
  createdByUsername?: string;
  lines: SaleLine[];
  createdAt: Date;
  updatedAt: Date;
}

export class Sale {
  private constructor(private readonly props: SaleProperties) {}

  public static create(payload: {
    id?: string;
    invoiceNumber: string;
    customerId: string;
    customerName?: string;
    customerDocument?: string;
    paymentMethod: SalePaymentMethod;
    bankAccountId?: string | null;
    lines: SaleLine[];
    amountPaid?: number;
    notes?: string | null;
    createdById: string;
    createdByUsername?: string;
  }): Sale {
    if (!payload.lines || payload.lines.length === 0) {
      throw new Error('Una venta debe contener al menos un producto');
    }

    const subtotal = payload.lines.reduce((acc, l) => acc + l.subtotal, 0);
    const taxTotal = payload.lines.reduce((acc, l) => acc + l.taxAmount, 0);
    const discountTotal = payload.lines.reduce((acc, l) => acc + l.discount, 0);
    const total = payload.lines.reduce((acc, l) => acc + l.total, 0);

    const amountPaid = payload.amountPaid !== undefined ? payload.amountPaid : total;
    if (payload.paymentMethod === 'EFECTIVO' && amountPaid < total) {
      throw new Error(
        `El monto recibido ($${amountPaid}) no cubre el valor total de la venta ($${total})`,
      );
    }
    const changeGiven = payload.paymentMethod === 'EFECTIVO' ? Math.max(0, amountPaid - total) : 0;

    const now = new Date();
    return new Sale({
      id: payload.id ?? crypto.randomUUID(),
      invoiceNumber: payload.invoiceNumber.trim().toUpperCase(),
      customerId: payload.customerId,
      customerName: payload.customerName,
      customerDocument: payload.customerDocument,
      status: 'COMPLETED',
      paymentMethod: payload.paymentMethod,
      bankAccountId: payload.bankAccountId ?? null,
      subtotal,
      taxTotal,
      discountTotal,
      total,
      amountPaid,
      changeGiven,
      notes: payload.notes?.trim() || null,
      createdById: payload.createdById,
      createdByUsername: payload.createdByUsername,
      lines: payload.lines,
      createdAt: now,
      updatedAt: now,
    });
  }

  public static reconstitute(props: SaleProperties): Sale {
    return new Sale(props);
  }

  public get id(): string {
    return this.props.id;
  }
  public get invoiceNumber(): string {
    return this.props.invoiceNumber;
  }
  public get customerId(): string {
    return this.props.customerId;
  }
  public get customerName(): string | undefined {
    return this.props.customerName;
  }
  public get customerDocument(): string | undefined {
    return this.props.customerDocument;
  }
  public get status(): SaleStatus {
    return this.props.status;
  }
  public get paymentMethod(): SalePaymentMethod {
    return this.props.paymentMethod;
  }
  public get bankAccountId(): string | null | undefined {
    return this.props.bankAccountId;
  }
  public get subtotal(): number {
    return this.props.subtotal;
  }
  public get taxTotal(): number {
    return this.props.taxTotal;
  }
  public get discountTotal(): number {
    return this.props.discountTotal;
  }
  public get total(): number {
    return this.props.total;
  }
  public get amountPaid(): number {
    return this.props.amountPaid;
  }
  public get changeGiven(): number {
    return this.props.changeGiven;
  }
  public get notes(): string | null | undefined {
    return this.props.notes;
  }
  public get createdById(): string {
    return this.props.createdById;
  }
  public get createdByUsername(): string | undefined {
    return this.props.createdByUsername;
  }
  public get lines(): SaleLine[] {
    return this.props.lines;
  }
  public get createdAt(): Date {
    return this.props.createdAt;
  }
  public get updatedAt(): Date {
    return this.props.updatedAt;
  }

  public cancel(): void {
    if (this.props.status === 'CANCELLED') {
      throw new Error('La venta ya se encuentra anulada');
    }
    this.props.status = 'CANCELLED';
    this.props.updatedAt = new Date();
  }

  public toDto(): SaleDto {
    return {
      id: this.props.id,
      invoiceNumber: this.props.invoiceNumber,
      customerId: this.props.customerId,
      customerName: this.props.customerName,
      customerDocument: this.props.customerDocument,
      status: this.props.status,
      paymentMethod: this.props.paymentMethod,
      bankAccountId: this.props.bankAccountId,
      subtotal: this.props.subtotal,
      taxTotal: this.props.taxTotal,
      discountTotal: this.props.discountTotal,
      total: this.props.total,
      amountPaid: this.props.amountPaid,
      changeGiven: this.props.changeGiven,
      notes: this.props.notes,
      createdById: this.props.createdById,
      createdByUsername: this.props.createdByUsername,
      lines: this.props.lines.map((l) => l.toDto()),
      createdAt: this.props.createdAt.toISOString(),
    };
  }
}
