import { SupplierDto } from '@farmacia/contracts';

export interface CreateSupplierProps {
  id?: string;
  taxId: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ReconstituteSupplierProps {
  id: string;
  taxId: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateSupplierProps {
  taxId?: string;
  name?: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  isActive?: boolean;
}

export class Supplier {
  private readonly _id: string;
  private _taxId: string;
  private _name: string;
  private _contactName: string | null;
  private _phone: string | null;
  private _email: string | null;
  private _address: string | null;
  private _isActive: boolean;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  private constructor(props: ReconstituteSupplierProps) {
    this._id = props.id;
    this._taxId = props.taxId;
    this._name = props.name;
    this._contactName = props.contactName;
    this._phone = props.phone;
    this._email = props.email;
    this._address = props.address;
    this._isActive = props.isActive;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  public static create(props: CreateSupplierProps): Supplier {
    const taxId = Supplier.validateTaxId(props.taxId);
    const name = Supplier.validateName(props.name);
    const contactName = Supplier.validateOptionalText(props.contactName, 100, 'Nombre de contacto');
    const phone = Supplier.validateOptionalText(props.phone, 50, 'Teléfono');
    const email = Supplier.validateEmail(props.email);
    const address = Supplier.validateOptionalText(props.address, 255, 'Dirección');

    const now = new Date();
    return new Supplier({
      id: props.id ?? crypto.randomUUID(),
      taxId,
      name,
      contactName,
      phone,
      email,
      address,
      isActive: props.isActive ?? true,
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
    });
  }

  public static reconstitute(props: ReconstituteSupplierProps): Supplier {
    return new Supplier(props);
  }

  public update(props: UpdateSupplierProps): void {
    if (props.taxId !== undefined) {
      this._taxId = Supplier.validateTaxId(props.taxId);
    }
    if (props.name !== undefined) {
      this._name = Supplier.validateName(props.name);
    }
    if (props.contactName !== undefined) {
      this._contactName = Supplier.validateOptionalText(props.contactName, 100, 'Nombre de contacto');
    }
    if (props.phone !== undefined) {
      this._phone = Supplier.validateOptionalText(props.phone, 50, 'Teléfono');
    }
    if (props.email !== undefined) {
      this._email = Supplier.validateEmail(props.email);
    }
    if (props.address !== undefined) {
      this._address = Supplier.validateOptionalText(props.address, 255, 'Dirección');
    }
    if (props.isActive !== undefined) {
      this._isActive = props.isActive;
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

  // Getters
  public get id(): string { return this._id; }
  public get taxId(): string { return this._taxId; }
  public get name(): string { return this._name; }
  public get contactName(): string | null { return this._contactName; }
  public get phone(): string | null { return this._phone; }
  public get email(): string | null { return this._email; }
  public get address(): string | null { return this._address; }
  public get isActive(): boolean { return this._isActive; }
  public get createdAt(): Date { return this._createdAt; }
  public get updatedAt(): Date { return this._updatedAt; }

  public toDto(): SupplierDto {
    return {
      id: this._id,
      taxId: this._taxId,
      name: this._name,
      contactName: this._contactName,
      phone: this._phone,
      email: this._email,
      address: this._address,
      isActive: this._isActive,
      createdAt: this._createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
    };
  }

  // Validaciones
  private static validateTaxId(taxId: string): string {
    if (!taxId || typeof taxId !== 'string') {
      throw new Error('El documento de identificación o NIT del proveedor es obligatorio');
    }
    const trimmed = taxId.trim();
    if (trimmed.length < 3 || trimmed.length > 50) {
      throw new Error('El NIT/identificación debe tener entre 3 y 50 caracteres');
    }
    return trimmed;
  }

  private static validateName(name: string): string {
    if (!name || typeof name !== 'string') {
      throw new Error('La razón social o nombre del proveedor es obligatorio');
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new Error('La razón social o nombre del proveedor es obligatorio');
    }
    if (trimmed.length < 2 || trimmed.length > 150) {
      throw new Error('La razón social debe tener entre 2 y 150 caracteres');
    }
    return trimmed;
  }

  private static validateOptionalText(
    value: string | null | undefined,
    maxLength: number,
    fieldName: string
  ): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (trimmed.length > maxLength) {
      throw new Error(`El campo ${fieldName} no puede exceder ${maxLength} caracteres`);
    }
    return trimmed;
  }

  private static validateEmail(email: string | null | undefined): string | null {
    if (email === undefined || email === null) {
      return null;
    }
    const trimmed = email.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (trimmed.length > 100) {
      throw new Error('El correo electrónico no puede exceder 100 caracteres');
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      throw new Error('El correo electrónico ingresado no tiene un formato válido');
    }
    return trimmed.toLowerCase();
  }
}
