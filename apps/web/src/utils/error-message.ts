/** Mensaje de un error capturado, o el texto por defecto si no trae uno legible. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
