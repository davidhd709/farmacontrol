/**
 * Excepciones de dominio para el módulo de Identidad.
 * Puras de TypeScript, desacopladas de frameworks HTTP o NestJS.
 */

export class InvalidUsernameException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidUsernameException';
  }
}

export class WeakPasswordException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WeakPasswordException';
  }
}

export class UserAlreadyExistsException extends Error {
  constructor(username: string) {
    super(`El usuario con identificador "${username}" ya existe en el sistema.`);
    this.name = 'UserAlreadyExistsException';
  }
}

export class UserNotFoundException extends Error {
  constructor(identifier: string) {
    super(`Usuario "${identifier}" no encontrado.`);
    this.name = 'UserNotFoundException';
  }
}

export class InvalidSessionTokenException extends Error {
  constructor(message = 'El token de sesión proporcionado no es válido.') {
    super(message);
    this.name = 'InvalidSessionTokenException';
  }
}

export class SessionExpiredException extends Error {
  constructor(message = 'La sesión ha expirado.') {
    super(message);
    this.name = 'SessionExpiredException';
  }
}

export class SessionRevokedException extends Error {
  constructor(message = 'La sesión ha sido revocada.') {
    super(message);
    this.name = 'SessionRevokedException';
  }
}

export class SessionNotFoundException extends Error {
  constructor(message = 'Sesión no encontrada.') {
    super(message);
    this.name = 'SessionNotFoundException';
  }
}

export class InvalidCredentialsException extends Error {
  constructor(message = 'Nombre de usuario o contraseña incorrectos.') {
    super(message);
    this.name = 'InvalidCredentialsException';
  }
}

export class InvalidSessionDurationException extends Error {
  constructor(
    message = 'La duración de la sesión debe ser un número entero positivo finito de milisegundos.'
  ) {
    super(message);
    this.name = 'InvalidSessionDurationException';
  }
}


