import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import {
  CreateThirdPartyPayload,
  ThirdPartyPersonType,
  ThirdPartyDocumentType,
  ThirdPartyTaxRegime,
} from '@farmacia/contracts';

export class CreateThirdPartyDto implements CreateThirdPartyPayload {
  personType?: ThirdPartyPersonType | string;
  documentType!: ThirdPartyDocumentType | string;
  documentNumber!: string;
  verificationDigit?: string | null;
  name!: string;
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

@Injectable()
export class CreateThirdPartyValidationPipe implements PipeTransform {
  public transform(value: unknown): CreateThirdPartyDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
    }

    const record = value as Record<string, unknown>;

    let personType: ThirdPartyPersonType = 'NATURAL';
    if (record.personType !== undefined && record.personType !== null) {
      if (typeof record.personType !== 'string') {
        throw new BadRequestException('El campo "personType" debe ser texto.');
      }
      const pt = record.personType.trim().toUpperCase();
      if (pt === 'JURIDICA' || pt === 'NATURAL') {
        personType = pt as ThirdPartyPersonType;
      }
    }

    let documentType: ThirdPartyDocumentType = 'CC';
    if (record.documentType !== undefined && record.documentType !== null) {
      if (typeof record.documentType !== 'string') {
        throw new BadRequestException('El campo "documentType" debe ser texto.');
      }
      documentType = record.documentType.trim().toUpperCase() as ThirdPartyDocumentType;
    }

    if (typeof record.documentNumber !== 'string') {
      throw new BadRequestException('El campo "documentNumber" es obligatorio y debe ser texto.');
    }
    const trimmedDoc = record.documentNumber.trim();
    if (trimmedDoc.length < 3 || trimmedDoc.length > 50) {
      throw new BadRequestException('El número de documento debe tener entre 3 y 50 caracteres.');
    }

    if (typeof record.name !== 'string') {
      throw new BadRequestException('El campo "name" (nombre o razón social) es obligatorio.');
    }
    const trimmedName = record.name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 200) {
      throw new BadRequestException('El nombre o razón social debe tener entre 2 y 200 caracteres.');
    }

    return {
      personType,
      documentType,
      documentNumber: trimmedDoc,
      verificationDigit: typeof record.verificationDigit === 'string' ? record.verificationDigit.trim() : null,
      name: trimmedName,
      tradeName: typeof record.tradeName === 'string' ? record.tradeName.trim() || null : null,
      contactName: typeof record.contactName === 'string' ? record.contactName.trim() || null : null,
      phone: typeof record.phone === 'string' ? record.phone.trim() || null : null,
      email: typeof record.email === 'string' ? record.email.trim() || null : null,
      address: typeof record.address === 'string' ? record.address.trim() || null : null,
      city: typeof record.city === 'string' ? record.city.trim() || null : null,
      department: typeof record.department === 'string' ? record.department.trim() || null : null,
      taxRegime: typeof record.taxRegime === 'string' ? record.taxRegime.trim().toUpperCase() : 'NO_RESPONSABLE_IVA',
      isCustomer: Boolean(record.isCustomer),
      isSupplier: Boolean(record.isSupplier),
      isEmployee: Boolean(record.isEmployee),
      isOther: Boolean(record.isOther),
      notes: typeof record.notes === 'string' ? record.notes.trim() || null : null,
    };
  }
}
