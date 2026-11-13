import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import { AppSidebar } from '../src/components/layout/AppSidebar';
import { menuGroups } from '../src/app/navigation';
import { appTheme } from '../src/theme/app-theme';
import { withAuth } from './support-auth';

/** Permisos del rol tesorería en el seed (packages/database/src/seed/rbac.seed.ts). */
const TESORERIA = [
  SYSTEM_PERMISSIONS.DISBURSEMENTS_CREATE,
  SYSTEM_PERMISSIONS.CASH_RECEIPTS_MANUAL,
  SYSTEM_PERMISSIONS.CASH_READ,
  SYSTEM_PERMISSIONS.TREASURY_READ,
  SYSTEM_PERMISSIONS.TREASURY_ACCOUNTS_SELECT,
  SYSTEM_PERMISSIONS.PAYABLES_READ,
  SYSTEM_PERMISSIONS.RECEIVABLES_READ,
];

describe('Navegación del rol tesorería (2026-11-03)', () => {
  it('muestra solo caja, tesorería y bancos, recibos, egresos y cuentas por cobrar y por pagar', () => {
    render(
      <ThemeProvider theme={appTheme}>
        <MemoryRouter>{withAuth(<AppSidebar open onClose={vi.fn()} />, TESORERIA)}</MemoryRouter>
      </ThemeProvider>,
    );
    const expected = [
      'Caja',
      'Bancos',
      'Recibos de caja',
      'Comprobantes de egreso',
      'Cuentas por cobrar',
      'Cuentas por pagar',
    ];
    const visible = menuGroups
      .flatMap((group) => group.items)
      .map((item) => item.title)
      .filter((title) => screen.queryByText(title));
    expect(visible.sort()).toEqual([...expected].sort());
  });
});
