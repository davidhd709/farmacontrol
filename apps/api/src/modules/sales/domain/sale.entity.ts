import {
  SaleStatus,
  SalePaymentMethod,
  SaleDto,
  SaleLineDto,
  SaleLotAllocationDto,
} from '@farmacia/contracts';
import { centsToNumber, divideHalfUp, toHundredths } from './sale-money';

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
  /** Costo por unidad base al confirmar la venta (decimal en texto); null en ventas antiguas */
  unitCostBase?: string | null;
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
    unitCostBase?: string | null;
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
    const exactBaseUnits = payload.quantityCommercial * factor;
    const quantityBaseUnits = Math.round(exactBaseUnits);
    // El inventario se lleva en unidades base enteras: no se redondea en silencio
    if (Math.abs(exactBaseUnits - quantityBaseUnits) > 1e-6) {
      throw new Error(
        `La cantidad ${payload.quantityCommercial} con factor ${factor} no equivale a unidades base enteras.`,
      );
    }

    // Importes en centavos exactos; IVA en puntos básicos (tarifa con dos decimales)
    const quantityHundredths = toHundredths(payload.quantityCommercial, 'La cantidad vendida');
    const unitPriceCents = toHundredths(payload.unitPrice, 'El precio unitario');
    const discountCents = toHundredths(payload.discount ?? 0, 'El descuento');
    const taxRateBasisPoints = toHundredths(payload.taxRate ?? 0, 'La tarifa de IVA');

    const grossCents = divideHalfUp(quantityHundredths * unitPriceCents, 100n);
    const subtotalCents = grossCents > discountCents ? grossCents - discountCents : 0n;
    const taxCents = divideHalfUp(subtotalCents * taxRateBasisPoints, 10000n);

    const discount = centsToNumber(discountCents);
    const subtotal = centsToNumber(subtotalCents);
    const taxRate = payload.taxRate ?? 0;
    const taxAmount = centsToNumber(taxCents);
    const total = centsToNumber(subtotalCents + taxCents);

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
      unitCostBase: payload.unitCostBase ?? null,
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

  public get unitCostBase(): string | null {
    return this.props.unitCostBase ?? null;
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

    const sumCents = (pick: (l: SaleLine) => number, label: string) =>
      payload.lines.reduce((acc, l) => acc + toHundredths(pick(l), label), 0n);
    const subtotalCents = sumCents((l) => l.subtotal, 'Subtotal de línea');
    const taxTotalCents = sumCents((l) => l.taxAmount, 'IVA de línea');
    const discountTotalCents = sumCents((l) => l.discount, 'Descuento de línea');
    const totalCents = sumCents((l) => l.total, 'Total de línea');

    const amountPaidCents =
      payload.amountPaid !== undefined
        ? toHundredths(payload.amountPaid, 'El monto recibido')
        : totalCents;
    if (payload.paymentMethod === 'EFECTIVO' && amountPaidCents < totalCents) {
      throw new Error(
        `El monto recibido ($${centsToNumber(amountPaidCents)}) no cubre el valor total de la venta ($${centsToNumber(totalCents)})`,
      );
    }
    const changeCents =
      payload.paymentMethod === 'EFECTIVO' && amountPaidCents > totalCents
        ? amountPaidCents - totalCents
        : 0n;

    const subtotal = centsToNumber(subtotalCents);
    const taxTotal = centsToNumber(taxTotalCents);
    const discountTotal = centsToNumber(discountTotalCents);
    const total = centsToNumber(totalCents);
    const amountPaid = centsToNumber(amountPaidCents);
    const changeGiven = centsToNumber(changeCents);

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
