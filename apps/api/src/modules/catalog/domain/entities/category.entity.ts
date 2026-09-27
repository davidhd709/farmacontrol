import { CategoryDto } from '@farmacia/contracts';

export interface CreateCategoryProps {
  id?: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ReconstituteCategoryProps {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class Category {
  private readonly _id: string;
  private _name: string;
  private _description: string | null;
  private _isActive: boolean;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: ReconstituteCategoryProps) {
    this._id = props.id;
    this._name = props.name;
    this._description = props.description;
    this._isActive = props.isActive;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  public static create(props: CreateCategoryProps): Category {
    const name = Category.validateName(props.name);
    const description = Category.validateDescription(props.description);

    const now = new Date();
    return new Category({
      id: props.id ?? crypto.randomUUID(),
      name,
      description,
      isActive: props.isActive ?? true,
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
    });
  }

  public static reconstitute(props: ReconstituteCategoryProps): Category {
    return new Category(props);
  }

  public get id(): string {
    return this._id;
  }

  public get name(): string {
    return this._name;
  }

  public get description(): string | null {
    return this._description;
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
    isActive?: boolean;
  }): void {
    if (props.name !== undefined) {
      this._name = Category.validateName(props.name);
    }
    if (props.description !== undefined) {
      this._description = Category.validateDescription(props.description);
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

  private static validateName(name: string): string {
    const trimmed = name ? name.trim() : '';
    if (!trimmed) {
      throw new Error('El nombre de la categoría no puede estar vacío.');
    }
    if (trimmed.length < 2) {
      throw new Error('El nombre de la categoría debe tener al menos 2 caracteres.');
    }
    if (trimmed.length > 100) {
      throw new Error('El nombre de la categoría no puede exceder 100 caracteres.');
    }
    return trimmed;
  }

  private static validateDescription(description?: string | null): string | null {
    if (description == null) {
      return null;
    }
    const trimmed = description.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.length > 255) {
      throw new Error('La descripción de la categoría no puede exceder 255 caracteres.');
    }
    return trimmed;
  }

  public toDto(): CategoryDto {
    return {
      id: this._id,
      name: this._name,
      description: this._description,
      isActive: this._isActive,
      createdAt: this._createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
    };
  }
}
