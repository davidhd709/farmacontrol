import { Session } from '../../domain/entities/session.entity';

export const SESSION_REPOSITORY_PORT = Symbol('SESSION_REPOSITORY_PORT');

/**
 * Puerto de repositorio para persistencia y recuperación de entidades Session.
 * Desacoplado de la tecnología de base de datos y de Prisma.
 */
export interface SessionRepositoryPort {
  /**
   * Persiste una nueva entidad Session en la base de datos.
   */
  create(session: Session): Promise<Session>;

  /**
   * Recupera una entidad Session por su hash determinista de token (tokenHash).
   */
  findByTokenHash(tokenHash: string): Promise<Session | null>;

  /**
   * Recupera una entidad Session por su identificador primario (UUID).
   */
  findById(id: string): Promise<Session | null>;

  /**
   * Actualiza los datos mutables de la sesión (lastUsedAt, revokedAt).
   */
  update(session: Session): Promise<Session>;

  /**
   * Elimina físicamente una sesión por su identificador.
   */
  delete(id: string): Promise<void>;

  /**
   * Elimina todas las sesiones activas asociadas a un usuario (revocación global).
   */
  deleteByUserId(userId: string): Promise<number>;
}
