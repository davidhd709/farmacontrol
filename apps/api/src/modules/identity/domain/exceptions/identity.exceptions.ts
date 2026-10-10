import { DomainError } from '../../../../common/domain-error';

/**
 * Excepciones de dominio para el módulo de Identidad.
 * Puras de TypeScript, desacopladas de frameworks HTTP o NestJS.
 */

export class InvalidUsernameException extends DomainError {
  constructor(message: string) {
    super(message, 'validation');
    this.name = 'InvalidUsernameException';
  }
}

export class WeakPasswordException extends DomainError {
  constructor(message: string) {
    super(message, 'validation');
    this.name = 'WeakPasswordException';
  }
}

export class UserAlreadyExistsException extends DomainError {
  constructor(username: string) {
    super(`El usuario con identificador "${username}" ya existe en el sistema.`, 'conflict');
    this.name = 'UserAlreadyExistsException';
  }
}

export class UserNotFoundException extends DomainError {
  constructor(identifier: string) {
    super(`Usuario "${identifier}" no encontrado.`, 'not_found');
    this.name = 'UserNotFoundException';
  }
}

export class InvalidSessionTokenException extends DomainError {
  constructor(message = 'El token de sesión proporcionado no es válido.') {
    super(message, 'unauthorized');
    this.name = 'InvalidSessionTokenException';
  }
}

export class SessionExpiredException extends DomainError {
  constructor(message = 'La sesión ha expirado.') {
    super(message, 'unauthorized');
    this.name = 'SessionExpiredException';
  }
}

export class SessionRevokedException extends DomainError {
  constructor(message = 'La sesión ha sido revocada.') {
    super(message, 'unauthorized');
    this.name = 'SessionRevokedException';
  }
}

export class SessionNotFoundException extends DomainError {
  constructor(message = 'Sesión no encontrada.') {
    super(message, 'not_found');
    this.name = 'SessionNotFoundException';
  }
}

export class InvalidCredentialsException extends DomainError {
  constructor(message = 'Nombre de usuario o contraseña incorrectos.') {
    super(message, 'unauthorized');
    this.name = 'InvalidCredentialsException';
  }
}

export class InvalidSessionDurationException extends DomainError {
  constructor(
    message = 'La duración de la sesión debe ser un número entero positivo finito de milisegundos.',
  ) {
    super(message, 'validation');
    this.name = 'InvalidSessionDurationException';
  }
}
