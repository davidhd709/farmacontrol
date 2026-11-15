import { ApiHeader } from '@nestjs/swagger';

/**
 * Documenta en OpenAPI la cabecera Idempotency-Key de una operación que mueve dinero,
 * inventario o contabilidad. La validación vive en el servicio de cada caso de uso: este
 * decorador solo describe el contrato.
 */
export function ApiIdempotencyKey(options: { required: boolean } = { required: true }) {
  const behaviour = options.required
    ? 'Obligatoria: sin ella la operación responde 400.'
    : 'Opcional: sin ella cada envío se procesa como una operación nueva.';
  return ApiHeader({
    name: 'Idempotency-Key',
    required: options.required,
    description:
      `Identificador único del intento (1 a 100 caracteres; se recomienda un UUID). ${behaviour} ` +
      'Repetir la misma clave con el mismo contenido devuelve la respuesta original sin volver a ' +
      'aplicar la operación; con otro contenido responde 409.',
    schema: { type: 'string', minLength: 1, maxLength: 100 },
  });
}
