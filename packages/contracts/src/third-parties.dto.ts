export type ThirdPartyPersonType = 'NATURAL' | 'JURIDICA';
export type ThirdPartyDocumentType = 'CC' | 'NIT' | 'CE' | 'PASAPORTE' | 'TI' | 'RUT';
export type ThirdPartyTaxRegime =
  | 'NO_RESPONSABLE_IVA'
  | 'RESPONSABLE_IVA'
  | 'REGIMEN_SIMPLE'
  | 'GRAN_CONTRIBUYENTE'
  | 'AUTORRETENEDOR';

export interface ThirdPartyDto {
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
  createdAt: string;
  updatedAt: string;
}

export interface CreateThirdPartyPayload {
  personType?: ThirdPartyPersonType | string;
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
  isCustomer?: boolean;
  isSupplier?: boolean;
  isEmployee?: boolean;
  isOther?: boolean;
  notes?: string | null;
}

export interface UpdateThirdPartyPayload {
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
}

export interface ThirdPartyQueryFilters {
  search?: string;
  role?: 'CUSTOMER' | 'SUPPLIER' | 'EMPLOYEE' | 'OTHER' | 'ALL';
  isActive?: boolean;
  page?: number;
  pageSize?: number;
  limit?: number;
}
