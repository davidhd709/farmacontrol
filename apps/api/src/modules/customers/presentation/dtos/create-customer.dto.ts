import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { CreateCustomerPayload, CustomerDocumentType } from '@farmacia/contracts';

export class CreateCustomerDto implements CreateCustomerPayload {
  documentType?: CustomerDocumentType | string;
  documentNumber!: string;
  name!: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  isDefault?: boolean;
}

@Injectable()
export class CreateCustomerValidationPipe implements PipeTransform {
  public transform(value: unknown): CreateCustomerDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
    }

    const record = value as Record<string, unknown>;

    let documentType = 'CC';
    if (record.documentType !== undefined && record.documentType !== null) {
      if (typeof record.documentType !== 'string') {
        throw new BadRequestException('El campo "documentType" debe ser texto.');
      }
      documentType = record.documentType.trim().toUpperCase() || 'CC';
    }

    if (typeof record.documentNumber !== 'string') {
      throw new BadRequestException('El campo "documentNumber" es obligatorio y debe ser texto.');
    }
    const trimmedDoc = record.documentNumber.trim();
    if (trimmedDoc.length < 3 || trimmedDoc.length > 50) {
      throw new BadRequestException('El número de documento debe tener entre 3 y 50 caracteres.');
    }

    if (typeof record.name !== 'string') {
      throw new BadRequestException('El campo "name" (nombre del cliente) es obligatorio y debe ser texto.');
    }
    const trimmedName = record.name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 150) {
      throw new BadRequestException('El nombre del cliente debe tener entre 2 y 150 caracteres.');
    }

    let phone: string | null = null;
    if (record.phone !== undefined && record.phone !== null) {
      if (typeof record.phone !== 'string') {
        throw new BadRequestException('El campo "phone" debe ser texto.');
      }
      phone = record.phone.trim() || null;
    }

    let email: string | null = null;
    if (record.email !== undefined && record.email !== null) {
      if (typeof record.email !== 'string') {
        throw new BadRequestException('El campo "email" debe ser texto.');
      }
      const trimmedEmail = record.email.trim();
      if (trimmedEmail.length > 0) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trimmedEmail)) {
          throw new BadRequestException('El correo electrónico no tiene un formato válido.');
        }
        email = trimmedEmail.toLowerCase();
      }
    }

    let address: string | null = null;
    if (record.address !== undefined && record.address !== null) {
      if (typeof record.address !== 'string') {
        throw new BadRequestException('El campo "address" debe ser texto.');
      }
      address = record.address.trim() || null;
    }

    const isDefault = Boolean(record.isDefault);

    return {
      documentType,
      documentNumber: trimmedDoc,
      name: trimmedName,
      phone,
      email,
      address,
      isDefault,
    };
  }
}
