import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { UpdateCustomerPayload, CustomerDocumentType } from '@farmacia/contracts';

export class UpdateCustomerDto implements UpdateCustomerPayload {
  documentType?: CustomerDocumentType | string;
  documentNumber?: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  isActive?: boolean;
}

@Injectable()
export class UpdateCustomerValidationPipe implements PipeTransform {
  public transform(value: unknown): UpdateCustomerDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
    }

    const record = value as Record<string, unknown>;
    const dto: UpdateCustomerDto = {};

    if (record.documentType !== undefined) {
      if (typeof record.documentType !== 'string') {
        throw new BadRequestException('El campo "documentType" debe ser texto.');
      }
      dto.documentType = record.documentType.trim().toUpperCase() || 'CC';
    }

    if (record.documentNumber !== undefined) {
      if (typeof record.documentNumber !== 'string') {
        throw new BadRequestException('El campo "documentNumber" debe ser texto.');
      }
      const trimmed = record.documentNumber.trim();
      if (trimmed.length < 3 || trimmed.length > 50) {
        throw new BadRequestException('El número de documento debe tener entre 3 y 50 caracteres.');
      }
      dto.documentNumber = trimmed;
    }

    if (record.name !== undefined) {
      if (typeof record.name !== 'string') {
        throw new BadRequestException('El campo "name" debe ser texto.');
      }
      const trimmed = record.name.trim();
      if (trimmed.length < 2 || trimmed.length > 150) {
        throw new BadRequestException('El nombre debe tener entre 2 y 150 caracteres.');
      }
      dto.name = trimmed;
    }

    if (record.phone !== undefined) {
      if (record.phone === null) {
        dto.phone = null;
      } else if (typeof record.phone === 'string') {
        dto.phone = record.phone.trim() || null;
      } else {
        throw new BadRequestException('El campo "phone" debe ser texto o null.');
      }
    }

    if (record.email !== undefined) {
      if (record.email === null) {
        dto.email = null;
      } else if (typeof record.email === 'string') {
        const trimmed = record.email.trim();
        if (trimmed.length > 0) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(trimmed)) {
            throw new BadRequestException('El correo electrónico no tiene un formato válido.');
          }
          dto.email = trimmed.toLowerCase();
        } else {
          dto.email = null;
        }
      } else {
        throw new BadRequestException('El campo "email" debe ser texto o null.');
      }
    }

    if (record.address !== undefined) {
      if (record.address === null) {
        dto.address = null;
      } else if (typeof record.address === 'string') {
        dto.address = record.address.trim() || null;
      } else {
        throw new BadRequestException('El campo "address" debe ser texto o null.');
      }
    }

    if (record.isActive !== undefined) {
      if (typeof record.isActive !== 'boolean') {
        throw new BadRequestException('El campo "isActive" debe ser booleano.');
      }
      dto.isActive = record.isActive;
    }

    return dto;
  }
}
