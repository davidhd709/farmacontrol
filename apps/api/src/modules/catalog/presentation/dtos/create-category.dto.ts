import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

export class CreateCategoryDto {
  name!: string;
  description?: string | null;
}

@Injectable()
export class CreateCategoryValidationPipe implements PipeTransform {
  public transform(value: unknown): CreateCategoryDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
    }

    const record = value as Record<string, unknown>;

    if (typeof record.name !== 'string') {
      throw new BadRequestException('El campo "name" es obligatorio y debe ser texto.');
    }

    const trimmedName = record.name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 100) {
      throw new BadRequestException(
        'El nombre de la categoría debe tener entre 2 y 100 caracteres.'
      );
    }

    let description: string | null = null;
    if (record.description !== undefined && record.description !== null) {
      if (typeof record.description !== 'string') {
        throw new BadRequestException('El campo "description" debe ser texto.');
      }
      const trimmedDesc = record.description.trim();
      if (trimmedDesc.length > 255) {
        throw new BadRequestException(
          'La descripción de la categoría no puede exceder 255 caracteres.'
        );
      }
      description = trimmedDesc || null;
    }

    return {
      name: trimmedName,
      description,
    };
  }
}
