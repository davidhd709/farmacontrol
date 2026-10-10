import { Injectable } from '@nestjs/common';
import { prisma, Prisma } from '@farmacia/database';
import type {
  DocumentLockDto,
  DocumentLockStatusDto,
  SetDocumentLockPayload,
} from '@farmacia/contracts';
import { AccountingValidationError } from '../domain/accounting-rules';
import { parseJournalDate } from '../domain/journal-rules';
import { businessToday } from '../../../common/utils/business-date';

type LockRecord = Prisma.DocumentLockGetPayload<{ include: { createdBy: { select: { username: true } } } }>;

function toDto(lock: LockRecord): DocumentLockDto {
  return {
    id: lock.id,
    lockedThrough: lock.lockedThrough ? lock.lockedThrough.toISOString().slice(0, 10) : null,
    reason: lock.reason,
    createdById: lock.createdById,
    createdByName: lock.createdBy?.username ?? null,
    createdAt: lock.createdAt.toISOString(),
  };
}

/**
 * Bloqueo de documentos por fecha (acuerdo del 4 de octubre): impide registrar o reversar
 * asientos con fecha igual o anterior al corte. La validación vive en JournalService; aquí
 * solo se consulta y se cambia el corte, siempre con motivo y dejando historial.
 */
@Injectable()
export class DocumentLockService {
  async getStatus(): Promise<DocumentLockStatusDto> {
    const history = await prisma.documentLock.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { createdBy: { select: { username: true } } },
    });
    return { current: history[0] ? toDto(history[0]) : null, history: history.map(toDto) };
  }

  async setLock(payload: SetDocumentLockPayload, userId: string): Promise<DocumentLockDto> {
    if (!payload || typeof payload !== 'object') {
      throw new AccountingValidationError('Datos de bloqueo inválidos.');
    }
    const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
    if (!reason || reason.length > 500) {
      throw new AccountingValidationError('El motivo es obligatorio (máximo 500 caracteres).');
    }
    let lockedThrough: Date | null = null;
    if (payload.lockedThrough !== null) {
      if (typeof payload.lockedThrough !== 'string') {
        throw new AccountingValidationError('La fecha de bloqueo debe tener formato YYYY-MM-DD.');
      }
      lockedThrough = parseJournalDate(payload.lockedThrough);
      // Bloquear el día de hoy o el futuro detendría las ventas del POS
      if (payload.lockedThrough >= businessToday()) {
        throw new AccountingValidationError(
          'Solo se pueden bloquear fechas anteriores a hoy; las ventas del día deben poder registrarse.',
        );
      }
    }

    // Serializable: un asiento con fecha retroactiva que se esté registrando en paralelo
    // entra en conflicto con el nuevo corte en lugar de colarse.
    const lock = await prisma.$transaction(
      async (tx) => {
        const created = await tx.documentLock.create({
          data: { lockedThrough, reason, createdById: userId },
          include: { createdBy: { select: { username: true } } },
        });
        await tx.auditEvent.create({
          data: {
            userId,
            action: lockedThrough ? 'accounting:documents_locked' : 'accounting:documents_unlocked',
            entity: 'DocumentLock',
            entityId: created.id,
            details: { lockedThrough: payload.lockedThrough, reason },
          },
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return toDto(lock);
  }
}
