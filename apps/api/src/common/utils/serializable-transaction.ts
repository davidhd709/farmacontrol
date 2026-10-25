import { Prisma, prisma } from '@farmacia/database';

/** Conflicto de serialización o interbloqueo: la transacción se puede repetir completa. */
function isSerializationConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2034') return true;
  const code = (error.meta as { code?: string } | undefined)?.code;
  if (code === '40001' || code === '40P01') return true;
  // Las consultas SQL directas informan el SQLSTATE solo en el mensaje
  const message = error.message.toLowerCase();
  return (
    message.includes('40001') ||
    message.includes('40p01') ||
    message.includes('could not serialize') ||
    message.includes('deadlock detected')
  );
}

/**
 * Transacción SERIALIZABLE con reintentos ante conflictos de serialización. Es el nivel que
 * exige publicar un asiento en la misma transacción de la operación (ADR-004).
 */
export async function serializableTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  maxRetries = 12,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30000,
      });
    } catch (error) {
      if (!isSerializationConflict(error) || attempt >= maxRetries) throw error;
      // Espera creciente con variación aleatoria: varias operaciones sobre la misma fila se
      // confirman de a una por ronda
      const delay = Math.min(30 * Math.pow(1.5, attempt) + Math.random() * 50, 1000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
