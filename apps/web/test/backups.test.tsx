import { ThemeProvider } from '@mui/material';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackupSummaryDto } from '@farmacia/contracts';
import * as backupsApi from '../src/features/backups/api/backups.api';
import { BackupManagementPage } from '../src/features/backups/pages/BackupManagementPage';
import { appTheme } from '../src/theme/app-theme';

const mockHealthyStatus: BackupSummaryDto = {
  totalBackups: 2,
  lastBackupAt: '2026-09-26T22:30:00.000Z',
  lastBackupFilename: 'farmacia_db_20260926_223000.dump',
  lastBackupSizeBytes: 95000000,
  isHealthyRpo: true,
  hoursSinceLastBackup: 1.5,
  backupDirectory: '/var/backups/farmacia',
  items: [
    {
      filename: 'farmacia_db_20260926_223000.dump',
      createdAt: '2026-09-26T22:30:00.000Z',
      sizeBytes: 95000000,
      sha256: 'a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef',
      verified: true,
      pgVersion: 'PostgreSQL 18.6',
    },
    {
      filename: 'farmacia_db_20260925_020000.dump',
      createdAt: '2026-09-25T02:00:00.000Z',
      sizeBytes: 92000000,
      sha256: 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
      verified: true,
      pgVersion: 'PostgreSQL 18.6',
    },
  ],
};

const mockUnhealthyStatus: BackupSummaryDto = {
  totalBackups: 1,
  lastBackupAt: '2026-09-20T02:00:00.000Z',
  lastBackupFilename: 'farmacia_db_old.dump',
  lastBackupSizeBytes: 80000000,
  isHealthyRpo: false,
  hoursSinceLastBackup: 140.2,
  backupDirectory: '/var/backups/farmacia',
  items: [
    {
      filename: 'farmacia_db_old.dump',
      createdAt: '2026-09-20T02:00:00.000Z',
      sizeBytes: 80000000,
      sha256: '9999999999999999999999999999999999999999999999999999999999999999',
      verified: true,
    },
  ],
};

function renderBackupPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={appTheme}>
        <MemoryRouter>
          <BackupManagementPage />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('BackupManagementPage (UX-31 — Copias de Seguridad y Resiliencia)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(backupsApi, 'fetchBackupStatus').mockResolvedValue(mockHealthyStatus);
    vi.spyOn(backupsApi, 'triggerCreateBackup').mockResolvedValue({
      success: true,
      message: 'Copia de seguridad generada y verificada exitosamente.',
      backup: mockHealthyStatus.items[0],
    });
    vi.spyOn(backupsApi, 'triggerVerifyBackup').mockResolvedValue({
      filename: 'farmacia_db_20260926_223000.dump',
      verified: true,
      sha256Match: true,
      message: 'Respaldo íntegro.',
    });
  });

  it('renderiza la cabecera, métricas KPI y la tabla de respaldos', async () => {
    renderBackupPage();

    expect(screen.getByText(/Copias de Seguridad y Resiliencia/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('farmacia_db_20260926_223000.dump')).toBeInTheDocument();
      expect(screen.getByText('farmacia_db_20260925_020000.dump')).toBeInTheDocument();
    });

    expect(screen.getByText('TOTAL RESPALDOS')).toBeInTheDocument();
    expect(screen.getByText('2 archivos')).toBeInTheDocument();
    expect(screen.getByText('ESTADO DE RPO')).toBeInTheDocument();
    expect(screen.getByText('EN REGLA')).toBeInTheDocument();
  });

  it('muestra la alerta de RPO en regla cuando el último respaldo es reciente', async () => {
    renderBackupPage();

    await waitFor(() => {
      expect(screen.getByTestId('rpo-status-alert')).toBeInTheDocument();
    });

    expect(screen.getByText(/RPO en Regla/i)).toBeInTheDocument();
  });

  it('muestra advertencia cuando el RPO está vencido (> 24 horas)', async () => {
    vi.spyOn(backupsApi, 'fetchBackupStatus').mockResolvedValue(mockUnhealthyStatus);

    renderBackupPage();

    await waitFor(() => {
      expect(screen.getByTestId('rpo-status-alert')).toBeInTheDocument();
      expect(screen.getByText(/Atención de Resiliencia/i)).toBeInTheDocument();
    });

    expect(screen.getByText('REVISIÓN')).toBeInTheDocument();
  });

  it('abre el diálogo modal y dispara la creación de un nuevo respaldo', async () => {
    renderBackupPage();

    await waitFor(() => {
      expect(screen.getByText('farmacia_db_20260926_223000.dump')).toBeInTheDocument();
    });

    const createBtn = screen.getByTestId('create-backup-btn');
    fireEvent.click(createBtn);

    expect(screen.getByText('¿Generar nueva copia de seguridad?')).toBeInTheDocument();

    const confirmBtn = screen.getByTestId('confirm-create-backup-btn');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(backupsApi.triggerCreateBackup).toHaveBeenCalled();
      expect(screen.getByText('Copia de seguridad generada y verificada exitosamente.')).toBeInTheDocument();
    });
  });

  it('ejecuta la verificación de integridad de un archivo al presionar Validar', async () => {
    renderBackupPage();

    await waitFor(() => {
      expect(screen.getByText('farmacia_db_20260926_223000.dump')).toBeInTheDocument();
    });

    const verifyBtn = screen.getByTestId('verify-btn-farmacia_db_20260926_223000.dump');
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(backupsApi.triggerVerifyBackup).toHaveBeenCalledWith('farmacia_db_20260926_223000.dump');
      expect(screen.getByText(/validado e íntegro/i)).toBeInTheDocument();
    });
  });
});
