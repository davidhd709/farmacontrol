import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

export class UpdateCategoryDto {
  name?: string;
  description?: string | null;
  isActive?: boolean;
}

@Injectable()
export class UpdateCategoryValidationPipe implements PipeTransform {
  public transform(value: unknown): UpdateCategoryDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
    }

    const record = value as Record<string, unknown>;
    const result: UpdateCategoryDto = {};

    if (record.name !== undefined) {
      if (typeof record.name !== 'string') {
        throw new BadRequestException('El campo "name" debe ser texto.');
      }
      const trimmedName = record.name.trim();
      if (trimmedName.length < 2 || trimmedName.length > 100) {
        throw new BadRequestException(
          'El nombre de la categoría debe tener entre 2 y 100 caracteres.'
        );
      }
      result.name = trimmedName;
    }

    if (record.description !== undefined) {
      if (record.description === null) {
        result.description = null;
      } else {
        if (typeof record.description !== 'string') {
          throw new BadRequestException('El campo "description" debe ser texto o null.');
        }
        const trimmedDesc = record.description.trim();
        if (trimmedDesc.length > 255) {
          throw new BadRequestException(
            'La descripción de la categoría no puede exceder 255 caracteres.'
          );
        }
        result.description = trimmedDesc || null;
      }
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
