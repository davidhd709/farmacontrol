import type { ProductPresentationDto } from '@farmacia/contracts';

export interface CreateProductPresentationProps {
  id?: string;
  productId: string;
  unitOfMeasureId?: string | null;
  containedPresentationId?: string | null;
  name: string;
  barcode?: string | null;
  quantityContained?: number;
  conversionFactor: number;
  price: number | string;
  cost?: number | string;
  purchaseEnabled?: boolean;
  saleEnabled?: boolean;
  isDefault?: boolean;
  isDefaultPurchase?: boolean;
  isDefaultSale?: boolean;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ReconstituteProductPresentationProps {
  id: string;
  productId: string;
  unitOfMeasureId: string | null;
  containedPresentationId: string | null;
  name: string;
  barcode: string | null;
  quantityContained: number;
  conversionFactor: number;
  price: string;
  cost: string;
  purchaseEnabled: boolean;
  saleEnabled: boolean;
  isDefault: boolean;
  isDefaultPurchase: boolean;
  isDefaultSale: boolean;
  isActive: boolean;
  unitOfMeasureCode?: string | null;
  unitOfMeasureName?: string | null;
  containedPresentationName?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ProductPresentation {
  private readonly _id: string;
  private readonly _productId: string;
  private _unitOfMeasureId: string | null;
  private _containedPresentationId: string | null;
  private _name: string;
  private _barcode: string | null;
  private _quantityContained: number;
  private _conversionFactor: number;
  private _price: string;
  private _cost: string;
  private _purchaseEnabled: boolean;
  private _saleEnabled: boolean;
  private _isDefault: boolean;
  private _isDefaultPurchase: boolean;
  private _isDefaultSale: boolean;
  private _isActive: boolean;
  private _unitOfMeasureCode?: string | null;
  private _unitOfMeasureName?: string | null;
  private _containedPresentationName?: string | null;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: ReconstituteProductPresentationProps) {
    this._id = props.id;
    this._productId = props.productId;
    this._unitOfMeasureId = props.unitOfMeasureId;
    this._containedPresentationId = props.containedPresentationId;
    this._name = props.name;
    this._barcode = props.barcode;
    this._quantityContained = props.quantityContained;
    this._conversionFactor = props.conversionFactor;
    this._price = props.price;
    this._cost = props.cost;
    this._purchaseEnabled = props.purchaseEnabled;
    this._saleEnabled = props.saleEnabled;
    this._isDefault = props.isDefault;
    this._isDefaultPurchase = props.isDefaultPurchase;
    this._isDefaultSale = props.isDefaultSale;
    this._isActive = props.isActive;
    this._unitOfMeasureCode = props.unitOfMeasureCode ?? null;
    this._unitOfMeasureName = props.unitOfMeasureName ?? null;
    this._containedPresentationName = props.containedPresentationName ?? null;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  public static create(props: CreateProductPresentationProps): ProductPresentation {
    if (!props.productId || !props.productId.trim()) {
      throw new Error('El ID del producto asociado es requerido.');
    }
    const name = ProductPresentation.validateName(props.name);
    const barcode = ProductPresentation.validateBarcode(props.barcode);
    const quantityContained = ProductPresentation.validateQuantityContained(props.quantityContained ?? 1);
    const conversionFactor = ProductPresentation.validateConversionFactor(props.conversionFactor);
    const price = ProductPresentation.validatePrice(props.price, 'precio');
    const cost = ProductPresentation.validatePrice(props.cost ?? 0, 'costo');

    if (props.containedPresentationId && props.id && props.containedPresentationId === props.id) {
      throw new Error('Una presentación no puede contenerse a sí misma.');
    }

    const now = new Date();
    const isDefault = props.isDefault ?? false;
    return new ProductPresentation({
      id: props.id ?? crypto.randomUUID(),
      productId: props.productId.trim(),
      unitOfMeasureId: props.unitOfMeasureId?.trim() || null,
      containedPresentationId: props.containedPresentationId?.trim() || null,
      name,
      barcode,
      quantityContained,
      conversionFactor,
      price,
      cost,
      purchaseEnabled: props.purchaseEnabled ?? true,
      saleEnabled: props.saleEnabled ?? true,
      isDefault,
      isDefaultPurchase: props.isDefaultPurchase ?? false,
      isDefaultSale: props.isDefaultSale ?? isDefault,
      isActive: props.isActive ?? true,
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
    });
  }

  public static reconstitute(props: ReconstituteProductPresentationProps): ProductPresentation {
    return new ProductPresentation(props);
  }

  public get id(): string {
    return this._id;
  }

  public get productId(): string {
    return this._productId;
  }

  public get unitOfMeasureId(): string | null {
    return this._unitOfMeasureId;
  }

  public get containedPresentationId(): string | null {
    return this._containedPresentationId;
  }

  public get name(): string {
    return this._name;
  }

  public get barcode(): string | null {
    return this._barcode;
  }

  public get quantityContained(): number {
    return this._quantityContained;
  }

  public get conversionFactor(): number {
    return this._conversionFactor;
  }

  public get baseFactor(): number {
    return this._conversionFactor;
  }

  public get price(): string {
    return this._price;
  }

  public get cost(): string {
    return this._cost;
  }

  public get purchaseEnabled(): boolean {
    return this._purchaseEnabled;
  }

  public get saleEnabled(): boolean {
    return this._saleEnabled;
  }

  public get isDefault(): boolean {
    return this._isDefault;
  }

  public get isDefaultPurchase(): boolean {
    return this._isDefaultPurchase;
  }

  public get isDefaultSale(): boolean {
    return this._isDefaultSale;
  }

  public get isActive(): boolean {
    return this._isActive;
  }

  public get unitOfMeasureCode(): string | null | undefined {
    return this._unitOfMeasureCode;
  }

  public get unitOfMeasureName(): string | null | undefined {
    return this._unitOfMeasureName;
  }

  public get containedPresentationName(): string | null | undefined {
    return this._containedPresentationName;
  }

  public get createdAt(): Date {
    return this._createdAt;
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }

  /**
   * Actualiza el factor de conversión acumulado a unidad base (calculado por el motor de dominio).
   */
  public updateConversionFactor(factor: number): void {
    this._conversionFactor = ProductPresentation.validateConversionFactor(factor);
    this._updatedAt = new Date();
  }

  /**
   * RN-004 / RN-AG-02: Convierte una cantidad de esta presentación a unidades base enteras.
   * cantidad_base = cantidad_presentacion * factor_equivalencia
   */
  public toBaseUnits(presentationQuantity: number): number {
    if (typeof presentationQuantity !== 'number' || isNaN(presentationQuantity)) {
      throw new Error('La cantidad de presentación debe ser un número válido.');
    }
    if (presentationQuantity < 0) {
      throw new Error('La cantidad de presentación no puede ser negativa.');
    }
    if (!Number.isInteger(presentationQuantity)) {
      throw new Error('La cantidad de presentación comercial debe ser un número entero discreto.');
    }
    return presentationQuantity * this._conversionFactor;
  }

  /**
   * RN-004 / RN-AG-02: Convierte una cantidad en unidades base a presentaciones enteras y residuo.
   */
  public fromBaseUnits(baseUnitsQuantity: number): {
    wholePresentations: number;
    remainderBaseUnits: number;
  } {
    if (typeof baseUnitsQuantity !== 'number' || isNaN(baseUnitsQuantity)) {
      throw new Error('La cantidad en unidades base debe ser un número válido.');
    }
    if (baseUnitsQuantity < 0) {
      throw new Error('La cantidad en unidades base no puede ser negativa.');
    }
    if (!Number.isInteger(baseUnitsQuantity)) {
      throw new Error('La cantidad en unidades base debe ser un número entero discreto.');
    }

    const wholePresentations = Math.floor(baseUnitsQuantity / this._conversionFactor);
    const remainderBaseUnits = baseUnitsQuantity % this._conversionFactor;

    return {
      wholePresentations,
      remainderBaseUnits,
    };
  }

  public update(props: {
    unitOfMeasureId?: string | null;
    containedPresentationId?: string | null;
    name?: string;
    barcode?: string | null;
    quantityContained?: number;
    conversionFactor?: number;
    price?: number | string;
    cost?: number | string;
    purchaseEnabled?: boolean;
    saleEnabled?: boolean;
    isDefault?: boolean;
    isDefaultPurchase?: boolean;
    isDefaultSale?: boolean;
    isActive?: boolean;
  }): void {
    if (props.unitOfMeasureId !== undefined) {
      this._unitOfMeasureId = props.unitOfMeasureId?.trim() || null;
    }
    if (props.containedPresentationId !== undefined) {
      if (props.containedPresentationId === this._id) {
        throw new Error('Una presentación no puede contenerse a sí misma.');
      }
      this._containedPresentationId = props.containedPresentationId?.trim() || null;
    }
    if (props.quantityContained !== undefined) {
      this._quantityContained = ProductPresentation.validateQuantityContained(props.quantityContained);
    }
    if (props.name !== undefined) {
      this._name = ProductPresentation.validateName(props.name);
    }
    if (props.barcode !== undefined) {
      this._barcode = ProductPresentation.validateBarcode(props.barcode);
    }
    if (props.conversionFactor !== undefined) {
      this._conversionFactor = ProductPresentation.validateConversionFactor(props.conversionFactor);
    }
    if (props.price !== undefined) {
      this._price = ProductPresentation.validatePrice(props.price, 'precio');
    }
    if (props.cost !== undefined) {
      this._cost = ProductPresentation.validatePrice(props.cost, 'costo');
    }
    if (props.purchaseEnabled !== undefined) {
      this._purchaseEnabled = Boolean(props.purchaseEnabled);
    }
    if (props.saleEnabled !== undefined) {
      this._saleEnabled = Boolean(props.saleEnabled);
    }
    if (props.isDefault !== undefined) {
      this._isDefault = Boolean(props.isDefault);
    }
    if (props.isDefaultPurchase !== undefined) {
      this._isDefaultPurchase = Boolean(props.isDefaultPurchase);
    }
    if (props.isDefaultSale !== undefined) {
      this._isDefaultSale = Boolean(props.isDefaultSale);
    }
    if (props.isActive !== undefined) {
      this._isActive = Boolean(props.isActive);
    }
    this._updatedAt = new Date();
  }

  public markAsDefault(): void {
    this._isDefault = true;
    this._isDefaultSale = true;
    this._updatedAt = new Date();
  }

  public unmarkAsDefault(): void {
    this._isDefault = false;
    this._isDefaultSale = false;
    this._updatedAt = new Date();
  }

  public activate(): void {
    this._isActive = true;
    this._updatedAt = new Date();
  }

  public deactivate(): void {
    this._isActive = false;
    this._updatedAt = new Date();
  }

  private static validateName(name: string): string {
    const trimmed = name ? name.trim() : '';
    if (!trimmed) {
      throw new Error('El nombre de la presentación comercial es requerido.');
    }
    if (trimmed.length < 1 || trimmed.length > 100) {
      throw new Error('El nombre de la presentación comercial debe tener entre 1 y 100 caracteres.');
    }
    return trimmed;
  }

  private static validateBarcode(barcode?: string | null): string | null {
    if (barcode == null) {
      return null;
    }
    const trimmed = barcode.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.length < 3 || trimmed.length > 50) {
      throw new Error('El código de barras de la presentación debe tener entre 3 y 50 caracteres.');
    }
    return trimmed;
  }

  private static validateQuantityContained(quantity: number): number {
    if (typeof quantity !== 'number' || isNaN(quantity)) {
      throw new Error('La cantidad contenida debe ser un número.');
    }
    if (!Number.isInteger(quantity)) {
      throw new Error('La cantidad contenida debe ser un número entero discreto.');
    }
    if (quantity <= 0) {
      throw new Error('La cantidad contenida debe ser estrictamente mayor a cero.');
    }
    return quantity;
  }

  private static validateConversionFactor(factor: number): number {
    if (typeof factor !== 'number' || isNaN(factor)) {
      throw new Error('El factor de conversión debe ser un número.');
    }
    if (!Number.isInteger(factor)) {
      throw new Error('El factor de conversión a unidad base debe ser un número entero (RN-AG-02).');
    }
    if (factor <= 0) {
      throw new Error('El factor de conversión debe ser estrictamente mayor a cero (RN-004).');
    }
    return factor;
  }

  private static validatePrice(value: number | string, fieldName: string): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) {
      throw new Error(`El valor para ${fieldName} no es un número válido.`);
    }
    if (num < 0) {
      throw new Error(`El ${fieldName} no puede ser un valor negativo.`);
    }
    return num.toFixed(2);
  }

  public toDto(): ProductPresentationDto {
    return {
      id: this._id,
      productId: this._productId,
      unitOfMeasureId: this._unitOfMeasureId,
      unitOfMeasureCode: this._unitOfMeasureCode,
      unitOfMeasureName: this._unitOfMeasureName,
      containedPresentationId: this._containedPresentationId,
      containedPresentationName: this._containedPresentationName,
      name: this._name,
      barcode: this._barcode,
      quantityContained: this._quantityContained,
      conversionFactor: this._conversionFactor,
      baseFactor: this._conversionFactor,
      price: this._price,
      cost: this._cost,
      purchaseEnabled: this._purchaseEnabled,
      saleEnabled: this._saleEnabled,
      isDefault: this._isDefault,
      isDefaultPurchase: this._isDefaultPurchase,
      isDefaultSale: this._isDefaultSale,
      isActive: this._isActive,
      createdAt: this._createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
    };
  }
}
