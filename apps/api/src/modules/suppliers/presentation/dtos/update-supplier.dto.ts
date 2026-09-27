import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { UpdateSupplierPayload } from '@farmacia/contracts';

export class UpdateSupplierDto implements UpdateSupplierPayload {
  taxId?: string;
  name?: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  isActive?: boolean;
}

@Injectable()
export class UpdateSupplierValidationPipe implements PipeTransform {
  public transform(value: unknown): UpdateSupplierDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
    }

    const record = value as Record<string, unknown>;
    const result: UpdateSupplierDto = {};

    if (record.taxId !== undefined) {
      if (typeof record.taxId !== 'string') {
        throw new BadRequestException('El campo "taxId" debe ser texto.');
      }
      const trimmedTaxId = record.taxId.trim();
      if (trimmedTaxId.length < 3 || trimmedTaxId.length > 50) {
        throw new BadRequestException('El NIT/identificación debe tener entre 3 y 50 caracteres.');
      }
      result.taxId = trimmedTaxId;
    }

    if (record.name !== undefined) {
      if (typeof record.name !== 'string') {
        throw new BadRequestException('El campo "name" debe ser texto.');
      }
      const trimmedName = record.name.trim();
      if (trimmedName.length < 2 || trimmedName.length > 150) {
        throw new BadRequestException('La razón social debe tener entre 2 y 150 caracteres.');
      }
      result.name = trimmedName;
    }

    if (record.contactName !== undefined) {
      if (record.contactName !== null && typeof record.contactName !== 'string') {
        throw new BadRequestException('El campo "contactName" debe ser texto o nulo.');
      }
      result.contactName = record.contactName ? (record.contactName as string).trim() || null : null;
    }

    if (record.phone !== undefined) {
      if (record.phone !== null && typeof record.phone !== 'string') {
        throw new BadRequestException('El campo "phone" debe ser texto o nulo.');
      }
      result.phone = record.phone ? (record.phone as string).trim() || null : null;
    }

    if (record.email !== undefined) {
      if (record.email !== null && typeof record.email !== 'string') {
        throw new BadRequestException('El campo "email" debe ser texto o nulo.');
      }
      if (record.email) {
        const trimmedEmail = (record.email as string).trim();
        if (trimmedEmail.length > 0) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(trimmedEmail)) {
            throw new BadRequestException('El correo electrónico ingresado no tiene un formato válido.');
          }
          result.email = trimmedEmail.toLowerCase();
        } else {
          result.email = null;
        }
      } else {
        result.email = null;
      }
    }

    if (record.address !== undefined) {
      if (record.address !== null && typeof record.address !== 'string') {
        throw new BadRequestException('El campo "address" debe ser texto o nulo.');
      }
      result.address = record.address ? (record.address as string).trim() || null : null;
    }

    if (record.isActive !== undefined) {
      if (typeof record.isActive !== 'boolean') {
        throw new BadRequestException('El campo "isActive" debe ser un booleano.');
      }
      result.isActive = record.isActive;
    }

    return result;
  }
}
