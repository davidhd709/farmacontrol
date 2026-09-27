import { z } from 'zod';

export const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'El usuario debe tener al menos 3 caracteres.')
    .max(50, 'El usuario no puede superar los 50 caracteres.')
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      'El usuario sólo puede contener letras, números, puntos, guiones y guiones bajos.',
    ),
  password: z
    .string()
    .min(10, 'La contraseña debe tener al menos 10 caracteres.')
    .max(128, 'La contraseña no puede superar los 128 caracteres.'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
