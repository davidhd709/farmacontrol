-- Contraseñas asignadas por un administrador (alta o restablecimiento) deben cambiarse
-- en el primer inicio de sesión. Las cuentas existentes no quedan obligadas.
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;
