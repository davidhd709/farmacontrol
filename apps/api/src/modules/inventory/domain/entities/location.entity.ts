import type { LocationDto } from '@farmacia/contracts';

export interface CreateLocationProps {
  id?: string;
  code: string;
  name: string;
  description?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Location {
  private readonly _id: string;
  private _code: string;
  private _name: string;
  private _description: string | null;
  private _isDefault: boolean;
  private _isActive: boolean;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  constructor(props: CreateLocationProps) {
    this._id = props.id ?? crypto.randomUUID();
    this._code = props.code.trim().toUpperCase();
    this._name = props.name.trim();
    this._description = props.description?.trim() || null;
    this._isDefault = props.isDefault ?? false;
    this._isActive = props.isActive ?? true;
    this._createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? new Date();
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
  public get isDefault(): boolean {
    return this._isDefault;
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

  public toDto(): LocationDto {
    return {
      id: this._id,
      code: this._code,
      name: this._name,
      description: this._description,
      isDefault: this._isDefault,
      isActive: this._isActive,
      createdAt: this._createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
    };
  }
}
