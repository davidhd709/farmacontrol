/** Coincide con la política validada por PasswordService en la API. */
export function validateNewPassword(password: string): string | null {
  if (password.length < 10 || password.length > 128) {
    return 'La contraseña debe tener entre 10 y 128 caracteres.';
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Incluye una letra mayúscula, una minúscula y un número.';
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(password)) {
    return 'Incluye al menos un carácter especial.';
  }
  return null;
}
