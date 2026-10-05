import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import {
  UpdateThirdPartyPayload,
  ThirdPartyPersonType,
  ThirdPartyDocumentType,
  ThirdPartyTaxRegime,
} from '@farmacia/contracts';

export class UpdateThirdPartyDto implements UpdateThirdPartyPayload {
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

@Injectable()
export class UpdateThirdPartyValidationPipe implements PipeTransform {
  public transform(value: unknown): UpdateThirdPartyDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
    }

    const record = value as Record<string, unknown>;
    const result: UpdateThirdPartyDto = {};

    if (record.personType !== undefined) {
      if (typeof record.personType !== 'string') {
        throw new BadRequestException('El campo "personType" debe ser texto.');
      }
      result.personType = record.personType.trim().toUpperCase();
    }

    if (record.documentType !== undefined) {
      if (typeof record.documentType !== 'string') {
        throw new BadRequestException('El campo "documentType" debe ser texto.');
      }
      result.documentType = record.documentType.trim().toUpperCase();
    }

    if (record.documentNumber !== undefined) {
      if (typeof record.documentNumber !== 'string') {
        throw new BadRequestException('El campo "documentNumber" debe ser texto.');
      }
      result.documentNumber = record.documentNumber.trim();
    }

    if (record.verificationDigit !== undefined) {
      result.verificationDigit = typeof record.verificationDigit === 'string' ? record.verificationDigit.trim() : null;
    }

    if (record.name !== undefined) {
      if (typeof record.name !== 'string') {
        throw new BadRequestException('El campo "name" debe ser texto.');
      }
      const trimmed = record.name.trim();
      if (trimmed.length < 2 || trimmed.length > 200) {
        throw new BadRequestException('El nombre o razón social debe tener entre 2 y 200 caracteres.');
      }
      result.name = trimmed;
    }

    if (record.tradeName !== undefined) {
      result.tradeName = typeof record.tradeName === 'string' ? record.tradeName.trim() || null : null;
    }

    if (record.contactName !== undefined) {
      result.contactName = typeof record.contactName === 'string' ? record.contactName.trim() || null : null;
    }

    if (record.phone !== undefined) {
      result.phone = typeof record.phone === 'string' ? record.phone.trim() || null : null;
    }

    if (record.email !== undefined) {
      result.email = typeof record.email === 'string' ? record.email.trim() || null : null;
    }

    if (record.address !== undefined) {
      result.address = typeof record.address === 'string' ? record.address.trim() || null : null;
    }

    if (record.city !== undefined) {
      result.city = typeof record.city === 'string' ? record.city.trim() || null : null;
    }

    if (record.department !== undefined) {
      result.department = typeof record.department === 'string' ? record.department.trim() || null : null;
    }

    if (record.taxRegime !== undefined) {
      result.taxRegime = typeof record.taxRegime === 'string' ? record.taxRegime.trim().toUpperCase() : null;
    }

    if (record.isCustomer !== undefined) {
      result.isCustomer = Boolean(record.isCustomer);
    }

    if (record.isSupplier !== undefined) {
      result.isSupplier = Boolean(record.isSupplier);
    }

    if (record.isEmployee !== undefined) {
      result.isEmployee = Boolean(record.isEmployee);
    }

    if (record.isOther !== undefined) {
      result.isOther = Boolean(record.isOther);
    }

    if (record.isActive !== undefined) {
      result.isActive = Boolean(record.isActive);
    }

    if (record.notes !== undefined) {
      result.notes = typeof record.notes === 'string' ? record.notes.trim() || null : null;
    }

    return result;
  }
}
