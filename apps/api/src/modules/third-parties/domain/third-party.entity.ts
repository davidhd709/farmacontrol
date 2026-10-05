import {
  ThirdPartyDto,
  ThirdPartyPersonType,
  ThirdPartyDocumentType,
  ThirdPartyTaxRegime,
} from '@farmacia/contracts';

export interface ThirdPartyProperties {
  id: string;
  personType: ThirdPartyPersonType | string;
  documentType: ThirdPartyDocumentType | string;
  documentNumber: string;
  verificationDigit?: string | null;
  name: string;
  tradeName?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  department?: string | null;
  taxRegime?: ThirdPartyTaxRegime | string | null;
  isCustomer: boolean;
  isSupplier: boolean;
  isEmployee: boolean;
  isOther: boolean;
  isActive: boolean;
  notes?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class ThirdParty {
  private constructor(private readonly props: ThirdPartyProperties) {}

  public static create(payload: {
    id?: string;
    personType?: ThirdPartyPersonType | string;
    documentType?: ThirdPartyDocumentType | string;
    documentNumber: string;
    verificationDigit?: string | null;
    name: string;
    tradeName?: string | null;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    city?: string | null;
    department?: string | null;
    taxRegime?: ThirdPartyTaxRegime | string | null;
    isCustomer?: boolean;
    isSupplier?: boolean;
    isEmployee?: boolean;
    isOther?: boolean;
    isActive?: boolean;
    notes?: string | null;
    customerId?: string | null;
    supplierId?: string | null;
  }): ThirdParty {
    const trimmedDoc = payload.documentNumber.trim();
    if (!trimmedDoc) {
      throw new Error('El número de documento del tercero es obligatorio');
    }
    const trimmedName = payload.name.trim();
    if (!trimmedName) {
      throw new Error('El nombre o razón social del tercero es obligatorio');
    }

    const now = new Date();
    return new ThirdParty({
      id: payload.id ?? crypto.randomUUID(),
      personType: payload.personType?.trim().toUpperCase() || 'NATURAL',
      documentType: payload.documentType?.trim().toUpperCase() || 'CC',
      documentNumber: trimmedDoc,
      verificationDigit: payload.verificationDigit?.trim() || null,
      name: trimmedName,
      tradeName: payload.tradeName?.trim() || null,
      contactName: payload.contactName?.trim() || null,
      phone: payload.phone?.trim() || null,
      email: payload.email?.trim() || null,
      address: payload.address?.trim() || null,
      city: payload.city?.trim() || null,
      department: payload.department?.trim() || null,
      taxRegime: payload.taxRegime?.trim().toUpperCase() || 'NO_RESPONSABLE_IVA',
      isCustomer: Boolean(payload.isCustomer),
      isSupplier: Boolean(payload.isSupplier),
      isEmployee: Boolean(payload.isEmployee),
      isOther: Boolean(payload.isOther),
      isActive: payload.isActive !== undefined ? payload.isActive : true,
      notes: payload.notes?.trim() || null,
      customerId: payload.customerId || null,
      supplierId: payload.supplierId || null,
      createdAt: now,
      updatedAt: now,
    });
  }

  public static reconstitute(props: ThirdPartyProperties): ThirdParty {
    return new ThirdParty(props);
  }

  public get id(): string {
    return this.props.id;
  }

  public get personType(): ThirdPartyPersonType | string {
    return this.props.personType;
  }

  public get documentType(): ThirdPartyDocumentType | string {
    return this.props.documentType;
  }

  public get documentNumber(): string {
    return this.props.documentNumber;
  }

  public get verificationDigit(): string | null | undefined {
    return this.props.verificationDigit;
  }

  public get name(): string {
    return this.props.name;
  }

  public get tradeName(): string | null | undefined {
    return this.props.tradeName;
  }

  public get contactName(): string | null | undefined {
    return this.props.contactName;
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

  public get city(): string | null | undefined {
    return this.props.city;
  }

  public get department(): string | null | undefined {
    return this.props.department;
  }

  public get taxRegime(): ThirdPartyTaxRegime | string | null | undefined {
    return this.props.taxRegime;
  }

  public get isCustomer(): boolean {
    return this.props.isCustomer;
  }

  public get isSupplier(): boolean {
    return this.props.isSupplier;
  }

  public get isEmployee(): boolean {
    return this.props.isEmployee;
  }

  public get isOther(): boolean {
    return this.props.isOther;
  }

  public get isActive(): boolean {
    return this.props.isActive;
  }

  public get notes(): string | null | undefined {
    return this.props.notes;
  }

  public get customerId(): string | null | undefined {
    return this.props.customerId;
  }

  public get supplierId(): string | null | undefined {
    return this.props.supplierId;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }

  public get updatedAt(): Date {
    return this.props.updatedAt;
  }

  public update(payload: {
    personType?: ThirdPartyPersonType | string;
    documentType?: ThirdPartyDocumentType | string;
    documentNumber?: string;
    verificationDigit?: string | null;
    name?: string;
    tradeName?: string | null;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    city?: string | null;
    department?: string | null;
    taxRegime?: ThirdPartyTaxRegime | string | null;
    isCustomer?: boolean;
    isSupplier?: boolean;
    isEmployee?: boolean;
    isOther?: boolean;
    isActive?: boolean;
    notes?: string | null;
  }): void {
    if (payload.name !== undefined) {
      const trimmed = payload.name.trim();
      if (!trimmed) throw new Error('El nombre o razón social no puede estar vacío');
      this.props.name = trimmed;
    }
    if (payload.personType !== undefined) {
      this.props.personType = payload.personType.trim().toUpperCase();
    }
    if (payload.documentType !== undefined) {
      this.props.documentType = payload.documentType.trim().toUpperCase();
    }
    if (payload.documentNumber !== undefined) {
      const trimmed = payload.documentNumber.trim();
      if (!trimmed) throw new Error('El número de documento no puede estar vacío');
      this.props.documentNumber = trimmed;
    }
    if (payload.verificationDigit !== undefined) {
      this.props.verificationDigit = payload.verificationDigit?.trim() || null;
    }
    if (payload.tradeName !== undefined) {
      this.props.tradeName = payload.tradeName?.trim() || null;
    }
    if (payload.contactName !== undefined) {
      this.props.contactName = payload.contactName?.trim() || null;
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
    if (payload.city !== undefined) {
      this.props.city = payload.city?.trim() || null;
    }
    if (payload.department !== undefined) {
      this.props.department = payload.department?.trim() || null;
    }
    if (payload.taxRegime !== undefined) {
      this.props.taxRegime = payload.taxRegime?.trim().toUpperCase() || 'NO_RESPONSABLE_IVA';
    }
    if (payload.isCustomer !== undefined) {
      this.props.isCustomer = payload.isCustomer;
    }
    if (payload.isSupplier !== undefined) {
      this.props.isSupplier = payload.isSupplier;
    }
    if (payload.isEmployee !== undefined) {
      this.props.isEmployee = payload.isEmployee;
    }
    if (payload.isOther !== undefined) {
      this.props.isOther = payload.isOther;
    }
    if (payload.isActive !== undefined) {
      this.props.isActive = payload.isActive;
    }
    if (payload.notes !== undefined) {
      this.props.notes = payload.notes?.trim() || null;
    }
    this.props.updatedAt = new Date();
  }

  public linkCustomer(customerId: string): void {
    this.props.customerId = customerId;
    this.props.updatedAt = new Date();
  }

  public linkSupplier(supplierId: string): void {
    this.props.supplierId = supplierId;
    this.props.updatedAt = new Date();
  }

  public deactivate(): void {
    this.props.isActive = false;
    this.props.updatedAt = new Date();
  }

  public activate(): void {
    this.props.isActive = true;
    this.props.updatedAt = new Date();
  }

  public toDto(): ThirdPartyDto {
    return {
      id: this.props.id,
      personType: this.props.personType,
      documentType: this.props.documentType,
      documentNumber: this.props.documentNumber,
      verificationDigit: this.props.verificationDigit,
      name: this.props.name,
      tradeName: this.props.tradeName,
      contactName: this.props.contactName,
      phone: this.props.phone,
      email: this.props.email,
      address: this.props.address,
      city: this.props.city,
      department: this.props.department,
      taxRegime: this.props.taxRegime,
      isCustomer: this.props.isCustomer,
      isSupplier: this.props.isSupplier,
      isEmployee: this.props.isEmployee,
      isOther: this.props.isOther,
      isActive: this.props.isActive,
      notes: this.props.notes,
      customerId: this.props.customerId,
      supplierId: this.props.supplierId,
      createdAt: this.props.createdAt.toISOString(),
      updatedAt: this.props.updatedAt.toISOString(),
    };
  }
}
