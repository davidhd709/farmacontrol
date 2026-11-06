import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_PASSWORD_CHANGE_KEY = 'allowPendingPasswordChange';

/**
 * Marca una ruta como accesible para una sesión cuya contraseña fue asignada por un
 * administrador y aún no se ha cambiado (consultar la sesión, cerrarla o cambiar la clave).
 */
export const AllowPendingPasswordChange = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE_KEY, true);
