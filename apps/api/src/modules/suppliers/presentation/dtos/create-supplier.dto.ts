import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { CreateSupplierPayload } from '@farmacia/contracts';

export class CreateSupplierDto implements CreateSupplierPayload {
  taxId!: string;
  name!: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

@Injectable()
export class CreateSupplierValidationPipe implements PipeTransform {
  public transform(value: unknown): CreateSupplierDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
    }

    const record = value as Record<string, unknown>;

    if (typeof record.taxId !== 'string') {
      throw new BadRequestException('El campo "taxId" (NIT/identificación) es obligatorio y debe ser texto.');
    }
    const trimmedTaxId = record.taxId.trim();
    if (trimmedTaxId.length < 3 || trimmedTaxId.length > 50) {
      throw new BadRequestException('El NIT/identificación debe tener entre 3 y 50 caracteres.');
    }

    if (typeof record.name !== 'string') {
      throw new BadRequestException('El campo "name" (razón social) es obligatorio y debe ser texto.');
    }
    const trimmedName = record.name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 150) {
      throw new BadRequestException('La razón social debe tener entre 2 y 150 caracteres.');
    }

    let contactName: string | null = null;
    if (record.contactName !== undefined && record.contactName !== null) {
      if (typeof record.contactName !== 'string') {
        throw new BadRequestException('El campo "contactName" debe ser texto.');
      }
      contactName = record.contactName.trim() || null;
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
          throw new BadRequestException('El correo electrónico ingresado no tiene un formato válido.');
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

    return {
      taxId: trimmedTaxId,
      name: trimmedName,
      contactName,
      phone,
      email,
      address,
    };
  }
}
