import type { UnitOfMeasureDto } from '@farmacia/contracts';

export interface CreateUnitOfMeasureProps {
  id?: string;
  code: string;
  name: string;
  description?: string | null;
  category?: string;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ReconstituteUnitOfMeasureProps {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class UnitOfMeasure {
  private readonly _id: string;
  private _code: string;
  private _name: string;
  private _description: string | null;
  private _category: string;
  private _isActive: boolean;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: ReconstituteUnitOfMeasureProps) {
    this._id = props.id;
    this._code = props.code;
    this._name = props.name;
    this._description = props.description;
    this._category = props.category;
    this._isActive = props.isActive;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  public static create(props: CreateUnitOfMeasureProps): UnitOfMeasure {
    const code = UnitOfMeasure.validateCode(props.code);
    const name = UnitOfMeasure.validateName(props.name);
    const category = (props.category || 'GENERAL').toUpperCase();
    const now = new Date();

    return new UnitOfMeasure({
      id: props.id ?? crypto.randomUUID(),
      code,
      name,
      description: props.description?.trim() || null,
      category,
      isActive: props.isActive ?? true,
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
    });
  }

  public static reconstitute(props: ReconstituteUnitOfMeasureProps): UnitOfMeasure {
    return new UnitOfMeasure(props);
  }

  public get id(): string {
    return this._id;
  }

  public get code(): string {
    return this._code;
  }

  public get name(): string {
    return this._name;
  }

  public get description(): string | null {
    return this._description;
  }

  public get category(): string {
    return this._category;
  }

  public get isActive(): boolean {
    return this._isActive;
  }

  public get createdAt(): Date {
    return this._createdAt;
  }

  public get updatedAt(): Date {
    return this._updatedAt;
  }

  public update(props: {
    name?: string;
    description?: string | null;
    category?: string;
    isActive?: boolean;
  }): void {
    if (props.name !== undefined) {
      this._name = UnitOfMeasure.validateName(props.name);
    }
    if (props.description !== undefined) {
      this._description = props.description?.trim() || null;
    }
    if (props.category !== undefined && props.category.trim()) {
      this._category = props.category.trim().toUpperCase();
    }
    if (props.isActive !== undefined) {
      this._isActive = Boolean(props.isActive);
    }
    this._updatedAt = new Date();
  }

  public deactivate(): void {
    this._isActive = false;
    this._updatedAt = new Date();
  }

  public activate(): void {
    this._isActive = true;
    this._updatedAt = new Date();
  }

  private static validateCode(code: string): string {
    const trimmed = code ? code.trim().toUpperCase() : '';
    if (!trimmed) {
      throw new Error('El código de la unidad de medida es requerido.');
    }
    if (trimmed.length < 1 || trimmed.length > 20) {
      throw new Error('El código debe tener entre 1 y 20 caracteres.');
    }
    return trimmed;
  }

  private static validateName(name: string): string {
    const trimmed = name ? name.trim() : '';
    if (!trimmed) {
      throw new Error('El nombre de la unidad de medida es requerido.');
    }
    if (trimmed.length < 2 || trimmed.length > 100) {
      throw new Error('El nombre debe tener entre 2 y 100 caracteres.');
    }
    return trimmed;
  }

  public toDto(): UnitOfMeasureDto {
    return {
      id: this._id,
      code: this._code,
      name: this._name,
      description: this._description,
      category: this._category,
      isActive: this._isActive,
      createdAt: this._createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
    };
  }
}
