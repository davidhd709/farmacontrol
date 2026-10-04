import type { ProductDto, ProductPresentationDto } from '@farmacia/contracts';

export interface CreateProductProps {
  id?: string;
  categoryId: string;
  categoryName?: string | null;
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
  isActive?: boolean;
  presentations?: ProductPresentationDto[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ReconstituteProductProps {
  id: string;
  categoryId: string;
  categoryName?: string | null;
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
  createdAt: Date;
  updatedAt: Date;
}

export class Product {
  private readonly _id: string;
  private _categoryId: string;
  private _categoryName?: string | null;
  private _code: string;
  private _barcode: string | null;
  private _name: string;
  private _genericName: string | null;
  private _concentration: string | null;
  private _sanitaryRegistry: string | null;
  private _manufacturer: string | null;
  private _description: string | null;
  private _requiresLotControl: boolean;
  private _prescriptionRequired: boolean;
  private _baseUnit: string;
  private _basePrice: string;
  private _baseCost: string;
  private _isActive: boolean;
  private _presentations?: ProductPresentationDto[];
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: ReconstituteProductProps) {
    this._id = props.id;
    this._categoryId = props.categoryId;
    this._categoryName = props.categoryName;
    this._code = props.code;
    this._barcode = props.barcode;
    this._name = props.name;
    this._genericName = props.genericName;
    this._concentration = props.concentration;
    this._sanitaryRegistry = props.sanitaryRegistry;
    this._manufacturer = props.manufacturer;
    this._description = props.description;
    this._requiresLotControl = props.requiresLotControl;
    this._prescriptionRequired = props.prescriptionRequired;
    this._baseUnit = props.baseUnit;
    this._basePrice = props.basePrice;
    this._baseCost = props.baseCost;
    this._isActive = props.isActive;
    this._presentations = props.presentations;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  public static create(props: CreateProductProps): Product {
    const code = Product.validateCode(props.code);
    const name = Product.validateName(props.name);
    const barcode = Product.validateBarcode(props.barcode);
    const basePrice = Product.validatePrice(props.basePrice, 'precio base');
    const baseCost = Product.validatePrice(props.baseCost ?? 0, 'costo base');
    const baseUnit = props.baseUnit?.trim().toUpperCase() || 'UNIDAD';

    const now = new Date();
    return new Product({
      id: props.id ?? crypto.randomUUID(),
      categoryId: props.categoryId,
      categoryName: props.categoryName ?? null,
      code,
      barcode,
      name,
      genericName: props.genericName?.trim() || null,
      concentration: props.concentration?.trim() || null,
      sanitaryRegistry: props.sanitaryRegistry?.trim() || null,
      manufacturer: props.manufacturer?.trim() || null,
      description: props.description?.trim() || null,
      requiresLotControl: props.requiresLotControl ?? true,
      prescriptionRequired: props.prescriptionRequired ?? false,
      baseUnit,
      basePrice,
      baseCost,
      isActive: props.isActive ?? true,
      presentations: props.presentations,
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
    });
  }

  public static reconstitute(props: ReconstituteProductProps): Product {
    return new Product(props);
  }

  public get id(): string {
    return this._id;
  }

  public get categoryId(): string {
    return this._categoryId;
  }

  public get categoryName(): string | null | undefined {
    return this._categoryName;
  }

  public get code(): string {
    return this._code;
  }

  public get barcode(): string | null {
    return this._barcode;
  }

  public get name(): string {
    return this._name;
  }

  public get genericName(): string | null {
    return this._genericName;
  }

  public get concentration(): string | null {
    return this._concentration;
  }

  public get sanitaryRegistry(): string | null {
    return this._sanitaryRegistry;
  }

  public get manufacturer(): string | null {
    return this._manufacturer;
  }

  public get description(): string | null {
    return this._description;
  }

  public get requiresLotControl(): boolean {
    return this._requiresLotControl;
  }

  public get prescriptionRequired(): boolean {
    return this._prescriptionRequired;
  }

  public get baseUnit(): string {
    return this._baseUnit;
  }

  public get basePrice(): string {
    return this._basePrice;
  }

  public get baseCost(): string {
    return this._baseCost;
  }

  public get isActive(): boolean {
    return this._isActive;
  }

  public get presentations(): ProductPresentationDto[] | undefined {
    return this._presentations;
  }

  public get createdAt(): Date {
    return this._createdAt;
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }

  public update(props: {
    categoryId?: string;
    categoryName?: string | null;
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
  }): void {
    if (props.categoryId !== undefined) {
      if (!props.categoryId.trim()) {
        throw new Error('La categoría del producto es requerida.');
      }
      this._categoryId = props.categoryId;
    }
    if (props.categoryName !== undefined) {
      this._categoryName = props.categoryName;
    }
    if (props.code !== undefined) {
      this._code = Product.validateCode(props.code);
    }
    if (props.barcode !== undefined) {
      this._barcode = Product.validateBarcode(props.barcode);
    }
    if (props.name !== undefined) {
      this._name = Product.validateName(props.name);
    }
    if (props.genericName !== undefined) {
      this._genericName = props.genericName?.trim() || null;
    }
    if (props.concentration !== undefined) {
      this._concentration = props.concentration?.trim() || null;
    }
    if (props.sanitaryRegistry !== undefined) {
      this._sanitaryRegistry = props.sanitaryRegistry?.trim() || null;
    }
    if (props.manufacturer !== undefined) {
      this._manufacturer = props.manufacturer?.trim() || null;
    }
    if (props.description !== undefined) {
      this._description = props.description?.trim() || null;
    }
    if (props.requiresLotControl !== undefined) {
      this._requiresLotControl = Boolean(props.requiresLotControl);
    }
    if (props.prescriptionRequired !== undefined) {
      this._prescriptionRequired = Boolean(props.prescriptionRequired);
    }
    if (props.baseUnit !== undefined) {
      this._baseUnit = props.baseUnit.trim().toUpperCase() || 'UNIDAD';
    }
    if (props.basePrice !== undefined) {
      this._basePrice = Product.validatePrice(props.basePrice, 'precio base');
    }
    if (props.baseCost !== undefined) {
      this._baseCost = Product.validatePrice(props.baseCost, 'costo base');
    }
    if (props.isActive !== undefined) {
      this._isActive = Boolean(props.isActive);
    }
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

  private static validateCode(code: string): string {
    const trimmed = code ? code.trim() : '';
    if (!trimmed) {
      throw new Error('El código interno (SKU) del producto es requerido.');
    }
    if (trimmed.length < 2 || trimmed.length > 50) {
      throw new Error('El código interno (SKU) debe tener entre 2 y 50 caracteres.');
    }
    return trimmed;
  }

  private static validateName(name: string): string {
    const trimmed = name ? name.trim() : '';
    if (!trimmed) {
      throw new Error('El nombre comercial del producto es requerido.');
    }
    if (trimmed.length < 2 || trimmed.length > 150) {
      throw new Error('El nombre comercial debe tener entre 2 y 150 caracteres.');
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
      throw new Error('El código de barras debe tener entre 3 y 50 caracteres si se proporciona.');
    }
    return trimmed;
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

  public toDto(availableStock?: number): ProductDto {
    return {
      id: this._id,
      categoryId: this._categoryId,
      categoryName: this._categoryName ?? undefined,
      code: this._code,
      barcode: this._barcode,
      name: this._name,
      genericName: this._genericName,
      concentration: this._concentration,
      sanitaryRegistry: this._sanitaryRegistry,
      manufacturer: this._manufacturer,
      description: this._description,
      requiresLotControl: this._requiresLotControl,
      prescriptionRequired: this._prescriptionRequired,
      baseUnit: this._baseUnit,
      basePrice: this._basePrice,
      baseCost: this._baseCost,
      isActive: this._isActive,
      availableStock: availableStock ?? undefined,
      presentations: this._presentations,
      createdAt: this._createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
    };
  }
}
