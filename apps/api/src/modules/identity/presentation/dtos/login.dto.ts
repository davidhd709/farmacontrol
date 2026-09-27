import {
  PipeTransform,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { PasswordService } from '../../application/services/password.service';

export class LoginDto {
  username!: string;
  password!: string;
}

/**
 * Pipe de validación estricta para LoginDto.
 * Rechaza payloads con propiedades faltantes, tipos incorrectos o longitudes fuera de rango.
 */
@Injectable()
export class LoginValidationPipe implements PipeTransform {
  transform(value: unknown): LoginDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('El cuerpo de la solicitud debe ser un objeto JSON válido.');
    }

    const record = value as Record<string, unknown>;

    // Validar username
    if (typeof record.username !== 'string') {
      throw new BadRequestException('El campo "username" es obligatorio y debe ser texto.');
    }

    const trimmedUsername = record.username.trim();
    if (trimmedUsername.length < 3 || trimmedUsername.length > 50) {
      throw new BadRequestException(
        'El nombre de usuario debe tener entre 3 y 50 caracteres.'
      );
    }

    // Validar password (incluye límite F-15 de 128 caracteres)
    if (typeof record.password !== 'string') {
      throw new BadRequestException('El campo "password" es obligatorio y debe ser texto.');
    }

    if (record.password.length < PasswordService.MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `La contraseña debe tener al menos ${PasswordService.MIN_PASSWORD_LENGTH} caracteres.`
      );
    }

    if (record.password.length > PasswordService.MAX_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `La contraseña no puede exceder los ${PasswordService.MAX_PASSWORD_LENGTH} caracteres.`
      );
    }

    return {
      username: trimmedUsername,
      password: record.password,
    };
  }
}
