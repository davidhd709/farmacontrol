import type {
  BackupSummaryDto,
  CreateBackupResultDto,
  VerifyBackupResultDto,
} from '@farmacia/contracts';
import { apiRequest } from '../../../api/http-client';

export async function fetchBackupStatus(): Promise<BackupSummaryDto> {
  return apiRequest<BackupSummaryDto>('backups/status', { method: 'GET' });
}

export async function triggerCreateBackup(): Promise<CreateBackupResultDto> {
  return apiRequest<CreateBackupResultDto>('backups/create', { method: 'POST' });
}

export async function triggerVerifyBackup(filename: string): Promise<VerifyBackupResultDto> {
  return apiRequest<VerifyBackupResultDto>(`backups/${encodeURIComponent(filename)}/verify`, {
    method: 'POST',
  });
}
