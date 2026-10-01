export type CustomerDocumentType = 'CC' | 'NIT' | 'CE' | 'PASAPORTE' | 'TI';

export interface CustomerDto {
  id: string;
  documentType: CustomerDocumentType | string;
  documentNumber: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerPayload {
  documentType?: CustomerDocumentType | string;
  documentNumber: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  isDefault?: boolean;
}

export interface UpdateCustomerPayload {
  documentType?: CustomerDocumentType | string;
  documentNumber?: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  isActive?: boolean;
}

export interface CustomerQueryFilters {
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}
