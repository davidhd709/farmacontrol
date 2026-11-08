import { DomainError } from '../../../common/domain-error';
import {
  ThirdPartyDto,
  ThirdPartyPersonType,
  ThirdPartyDocumentType,
  ThirdPartyTaxRegime,
  resolveThirdPartyDivipolaLocation,
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
  departmentCode?: string | null;
  municipalityCode?: string | null;
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

function validateAndNormalizeLocation(
  input: {
    department?: string | null;
    city?: string | null;
    departmentCode?: string | null;
    municipalityCode?: string | null;
  },
  existingLegacy?: { department?: string | null; city?: string | null },
): {
  department: string | null;
  city: string | null;
  departmentCode: string | null;
  municipalityCode: string | null;
} {
  const resolution = resolveThirdPartyDivipolaLocation(input);

  const isUnchangedLegacy = Boolean(
    existingLegacy &&
      (input.department?.trim() || null) === (existingLegacy.department?.trim() || null) &&
      (input.city?.trim() || null) === (existingLegacy.city?.trim() || null) &&
      !input.departmentCode &&
      !input.municipalityCode,
  );

  switch (resolution.status) {
    case 'EMPTY':
      return {
        department: null,
        city: null,
        departmentCode: null,
        municipalityCode: null,
      };
    case 'RESOLVED':
    case 'RESOLVED_UNIQUE_CITY':
      return {
        department: resolution.department!.name,
        city: resolution.municipality!.name,
        departmentCode: resolution.department!.code,
        municipalityCode: resolution.municipality!.code,
      };
    case 'DEPARTMENT_ONLY':
      return {
        department: resolution.department!.name,
        city: null,
        departmentCode: resolution.department!.code,
        municipalityCode: null,
      };
    case 'MISMATCHED_MUNICIPALITY': {
      if (isUnchangedLegacy) {
        return {
          department: existingLegacy?.department?.trim() || null,
          city: existingLegacy?.city?.trim() || null,
          departmentCode: resolution.department?.code ?? null,
          municipalityCode: null,
        };
      }
      const mpioLabel = input.city?.trim() || input.municipalityCode?.trim() || '';
      const deptLabel = resolution.department?.name || input.department?.trim() || '';
      throw new DomainError(
        `El municipio "${mpioLabel}" no pertenece al departamento "${deptLabel}" según el catálogo DIVIPOLA.`,
        'validation',
      );
    }
    case 'AMBIGUOUS_CITY': {
      if (isUnchangedLegacy) {
        return {
          department: existingLegacy?.department?.trim() || null,
          city: existingLegacy?.city?.trim() || null,
          departmentCode: null,
          municipalityCode: null,
        };
      }
      const mpioLabel = input.city?.trim() || '';
      throw new DomainError(
        `El municipio "${mpioLabel}" existe en varios departamentos; debe seleccionar el departamento correspondiente.`,
        'validation',
      );
    }
    case 'UNRECOGNIZED_DEPARTMENT': {
      if (isUnchangedLegacy) {
        return {
          department: existingLegacy?.department?.trim() || null,
          city: existingLegacy?.city?.trim() || null,
          departmentCode: null,
          municipalityCode: null,
        };
      }
      const deptLabel = input.department?.trim() || input.departmentCode?.trim() || '';
      throw new DomainError(
        `El departamento "${deptLabel}" no existe en el catálogo oficial DIVIPOLA.`,
        'validation',
      );
    }
    case 'UNRECOGNIZED_CITY': {
      if (isUnchangedLegacy) {
        return {
          department: existingLegacy?.department?.trim() || null,
          city: existingLegacy?.city?.trim() || null,
          departmentCode: resolution.department?.code ?? null,
          municipalityCode: null,
        };
      }
      const mpioLabel = input.city?.trim() || input.municipalityCode?.trim() || '';
      throw new DomainError(
        `El municipio "${mpioLabel}" no existe en el catálogo oficial DIVIPOLA.`,
        'validation',
      );
    }
  }
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
    departmentCode?: string | null;
    municipalityCode?: string | null;
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
      throw new DomainError('El número de documento del tercero es obligatorio', 'validation');
    }
    const trimmedName = payload.name.trim();
    if (!trimmedName) {
      throw new DomainError('El nombre o razón social del tercero es obligatorio', 'validation');
    }

    const location = validateAndNormalizeLocation({
      department: payload.department,
      city: payload.city,
      departmentCode: payload.departmentCode,
      municipalityCode: payload.municipalityCode,
    });

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
      city: location.city,
      department: location.department,
      departmentCode: location.departmentCode,
      municipalityCode: location.municipalityCode,
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
    const resolution = resolveThirdPartyDivipolaLocation({
      department: props.department,
      city: props.city,
      departmentCode: props.departmentCode,
      municipalityCode: props.municipalityCode,
    });
    const derivedDeptCode =
      props.departmentCode ??
      (resolution.status === 'RESOLVED' ||
      resolution.status === 'RESOLVED_UNIQUE_CITY' ||
      resolution.status === 'DEPARTMENT_ONLY'
        ? (resolution.department?.code ?? null)
        : null);
    const derivedMpioCode =
      props.municipalityCode ??
      (resolution.status === 'RESOLVED' || resolution.status === 'RESOLVED_UNIQUE_CITY'
        ? (resolution.municipality?.code ?? null)
        : null);

    return new ThirdParty({
      ...props,
      departmentCode: derivedDeptCode,
      municipalityCode: derivedMpioCode,
    });
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

  public get departmentCode(): string | null | undefined {
    return this.props.departmentCode;
  }

  public get municipalityCode(): string | null | undefined {
    return this.props.municipalityCode;
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
    departmentCode?: string | null;
    municipalityCode?: string | null;
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
      if (!trimmed)
        throw new DomainError('El nombre o razón social no puede estar vacío', 'validation');
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
      if (!trimmed)
        throw new DomainError('El número de documento no puede estar vacío', 'validation');
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
    if (
      payload.city !== undefined ||
      payload.department !== undefined ||
      payload.departmentCode !== undefined ||
      payload.municipalityCode !== undefined
    ) {
      const nextDept =
        payload.department !== undefined
          ? payload.department
          : payload.departmentCode !== undefined
            ? null
            : this.props.department;
      const nextCity =
        payload.city !== undefined
          ? payload.city
          : payload.municipalityCode !== undefined
            ? null
            : this.props.city;

      const location = validateAndNormalizeLocation(
        {
          department: nextDept,
          city: nextCity,
          departmentCode: payload.departmentCode,
          municipalityCode: payload.municipalityCode,
        },
        {
          department: this.props.department,
          city: this.props.city,
        },
      );
      this.props.department = location.department;
      this.props.city = location.city;
      this.props.departmentCode = location.departmentCode;
      this.props.municipalityCode = location.municipalityCode;
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
      departmentCode: this.props.departmentCode ?? null,
      municipalityCode: this.props.municipalityCode ?? null,
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
