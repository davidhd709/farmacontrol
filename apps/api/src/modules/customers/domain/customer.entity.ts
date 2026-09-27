import { CustomerDto, CustomerDocumentType } from '@farmacia/contracts';

export interface CustomerProperties {
  id: string;
  documentType: CustomerDocumentType | string;
  documentNumber: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class Customer {
  private constructor(private readonly props: CustomerProperties) {}

  public static create(payload: {
    id?: string;
    documentType?: CustomerDocumentType | string;
    documentNumber: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    isDefault?: boolean;
    isActive?: boolean;
  }): Customer {
    const trimmedDoc = payload.documentNumber.trim();
    if (!trimmedDoc) {
      throw new Error('El número de documento del cliente es obligatorio');
    }
    const trimmedName = payload.name.trim();
    if (!trimmedName) {
      throw new Error('El nombre o razón social del cliente es obligatorio');
    }

    const now = new Date();
    return new Customer({
      id: payload.id ?? crypto.randomUUID(),
      documentType: payload.documentType?.trim().toUpperCase() || 'CC',
      documentNumber: trimmedDoc,
      name: trimmedName,
      phone: payload.phone?.trim() || null,
      email: payload.email?.trim() || null,
      address: payload.address?.trim() || null,
      isDefault: Boolean(payload.isDefault),
      isActive: payload.isActive !== undefined ? payload.isActive : true,
      createdAt: now,
      updatedAt: now,
    });
  }

  public static reconstitute(props: CustomerProperties): Customer {
    return new Customer(props);
  }

  public get id(): string {
    return this.props.id;
  }

  public get documentType(): string {
    return this.props.documentType;
  }

  public get documentNumber(): string {
    return this.props.documentNumber;
  }

  public get name(): string {
    return this.props.name;
  }

  public get phone(): string | null | undefined {
    return this.props.phone;
  }

  public get email(): string | null | undefined {
    return this.props.email;
  }

  public get address(): string | null | undefined {
    return this.props.address;
  }

  public get isDefault(): boolean {
    return this.props.isDefault;
  }

  public get isActive(): boolean {
    return this.props.isActive;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }

  public get updatedAt(): Date {
    return this.props.updatedAt;
  }

  public update(payload: {
    documentType?: string;
    name?: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    isActive?: boolean;
  }): void {
    if (payload.documentType !== undefined) {
      this.props.documentType = payload.documentType.trim().toUpperCase() || 'CC';
    }
    if (payload.name !== undefined) {
      const trimmed = payload.name.trim();
      if (!trimmed) {
        throw new Error('El nombre del cliente no puede ser vacío');
      }
      this.props.name = trimmed;
    }
    if (payload.phone !== undefined) {
      this.props.phone = payload.phone?.trim() || null;
    }
    if (payload.email !== undefined) {
      this.props.email = payload.email?.trim() || null;
    }
    if (payload.address !== undefined) {
      this.props.address = payload.address?.trim() || null;
    }
    if (payload.isActive !== undefined) {
      if (this.props.isDefault && !payload.isActive) {
        throw new Error('No se puede desactivar el cliente predeterminado (Consumidor Final)');
      }
      this.props.isActive = payload.isActive;
    }
    this.props.updatedAt = new Date();
  }

  public deactivate(): void {
    if (this.props.isDefault) {
      throw new Error('No se puede inactivar el cliente predeterminado');
    }
    this.props.isActive = false;
    this.props.updatedAt = new Date();
  }

  public activate(): void {
    this.props.isActive = true;
    this.props.updatedAt = new Date();
  }

  public toDto(): CustomerDto {
    return {
      id: this.props.id,
      documentType: this.props.documentType,
      documentNumber: this.props.documentNumber,
      name: this.props.name,
      phone: this.props.phone,
      email: this.props.email,
      address: this.props.address,
      isDefault: this.props.isDefault,
      isActive: this.props.isActive,
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
    };
  }
}
