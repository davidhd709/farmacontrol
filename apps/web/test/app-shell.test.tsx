import type React from 'react';
import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PERMISSIONS as P } from '@farmacia/contracts';
import { appTheme } from '../src/theme/app-theme';
import { AuthContext, type AuthContextValue } from '../src/features/auth/context/auth-context';
import { AppSidebar } from '../src/components/layout/AppSidebar';
import { AppNavbar } from '../src/components/layout/AppNavbar';
import { menuGroupForPath, menuGroups } from '../src/app/navigation';
import * as alertsApi from '../src/features/alerts/api/alerts.api';

function renderShell(ui: React.ReactElement, permissions: string[], path = '/') {
  const auth: AuthContextValue = {
    user: { id: 'u', username: 'caja1', isActive: true, roles: ['cajero'], permissions },
    status: 'authenticated',
    sessionError: null,
    isLoggingIn: false,
    isLoggingOut: false,
    login: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    retrySession: vi.fn(),
  };
  render(
    <ThemeProvider theme={appTheme}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AuthContext.Provider value={auth}>
          <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return auth;
}

const ALL = Object.values(P);

describe('Menú lateral agrupado (rediseño fase 1)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('agrupa por tarea: compras fuera de inventario y tesorería fuera de contabilidad', () => {
    expect(menuGroupForPath('/purchases/receive')?.id).toBe('compras');
    expect(menuGroupForPath('/purchases')?.id).toBe('compras');
    expect(menuGroupForPath('/inventory/lots')?.id).toBe('inventario');
    expect(menuGroupForPath('/treasury/disbursements')?.id).toBe('tesoreria');
    expect(menuGroupForPath('/expenses')?.id).toBe('contabilidad');
    expect(menuGroupForPath('/audit')?.id).toBe('configuracion');
    // Una ruta hija (detalle de venta) pertenece al grupo de su entrada
    expect(menuGroupForPath('/sales/abc')?.id).toBe('ventas');
    expect(menuGroups.map((g) => g.category)).toEqual([
      'Ventas',
      'Compras',
      'Inventario',
      'Terceros',
      'Tesorería',
      'Contabilidad',
      'Reportes',
      'Configuración',
    ]);
  });

  it('abre el grupo de la ruta actual y marca la entrada activa como página actual', () => {
    renderShell(<AppSidebar open onClose={vi.fn()} />, ALL, '/treasury/receipts');
    const nav = screen.getByRole('navigation', { name: 'Menú principal' });
    expect(within(nav).getByRole('button', { name: 'Tesorería' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(within(nav).getByRole('button', { name: 'Contabilidad' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(within(nav).getByRole('link', { name: 'Recibos de caja' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Recibos de caja' })).toHaveAttribute(
      'href',
      '/treasury/receipts',
    );
  });

  it('sin preferencia guardada abre el primer grupo del perfil (Ventas para caja)', () => {
    renderShell(<AppSidebar open onClose={vi.fn()} />, ALL, '/');
    expect(screen.getByRole('button', { name: 'Ventas' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Compras' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('pliega y despliega un grupo con teclado y recuerda la elección', async () => {
    const user = userEvent.setup();
    renderShell(<AppSidebar open onClose={vi.fn()} />, ALL, '/');
    const inventory = screen.getByRole('button', { name: 'Inventario' });
    expect(inventory).toHaveAttribute('aria-expanded', 'false');
    inventory.focus();
    await user.keyboard('{Enter}');
    expect(inventory).toHaveAttribute('aria-expanded', 'true');
    expect(
      JSON.parse(window.localStorage.getItem('farmacontrol.sidebar.openGroups') ?? '[]'),
    ).toContain('inventario');
  });

  it('con pocos accesos (cajero) muestra todos sus grupos abiertos y oculta los demás', () => {
    renderShell(
      <AppSidebar open onClose={vi.fn()} />,
      [P.SALES_CREATE, P.SALES_READ, P.CUSTOMERS_READ],
      '/',
    );
    expect(screen.getByRole('button', { name: 'Ventas' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('button', { name: 'Contabilidad' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Configuración' })).not.toBeInTheDocument();
  });

  it('el pie muestra el ambiente informado por el API y nunca presume producción', () => {
    renderShell(
      <AppSidebar
        open
        onClose={vi.fn()}
        environment={{ environment: 'pruebas', label: 'Pruebas' }}
      />,
      ALL,
    );
    expect(screen.getByTestId('sidebar-environment')).toHaveTextContent('Pruebas');
  });

  it('sin ambiente configurado no hay etiqueta', () => {
    renderShell(
      <AppSidebar open onClose={vi.fn()} environment={{ environment: null, label: null }} />,
      ALL,
    );
    expect(screen.queryByTestId('sidebar-environment')).not.toBeInTheDocument();
    expect(screen.queryByText(/Producción/)).not.toBeInTheDocument();
  });
});

describe('Barra superior (rediseño fase 1)', () => {
  it('agrupa cambio de contraseña y cierre de sesión en el menú del usuario', async () => {
    const user = userEvent.setup();
    const auth = renderShell(<AppNavbar onToggleSidebar={vi.fn()} isSidebarOpen />, [
      P.SALES_CREATE,
    ]);
    expect(screen.queryByRole('menuitem', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Menú de caja1' }));
    expect(await screen.findByRole('menuitem', { name: 'Cambiar contraseña' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }));
    expect(auth.logout).toHaveBeenCalledOnce();
  });

  it('Nueva venta y Alertas solo con su permiso; sin permiso no consulta alertas', () => {
    const summary = vi.spyOn(alertsApi, 'fetchAlertsSummary');
    renderShell(<AppNavbar onToggleSidebar={vi.fn()} isSidebarOpen />, [P.SALES_CREATE]);
    expect(screen.getByRole('link', { name: 'Nueva venta' })).toHaveAttribute('href', '/pos');
    expect(screen.queryByTestId('topbar-alerts-btn')).not.toBeInTheDocument();
    expect(summary).not.toHaveBeenCalled();
  });

  it('con permiso de alertas muestra el conteo con texto', async () => {
    vi.spyOn(alertsApi, 'fetchAlertsSummary').mockResolvedValue({
      totalActive: 4,
      vencidos: 1,
      criticos: 2,
      alertas: 1,
      proximos: 0,
    });
    renderShell(<AppNavbar onToggleSidebar={vi.fn()} isSidebarOpen />, [
      P.INVENTORY_READ,
      P.ALERTS_READ,
    ]);
    expect(
      await screen.findByRole('link', { name: 'Alertas de vencimiento: 3 vencidos o críticos' }),
    ).toHaveAttribute('href', '/alerts');
    expect(screen.queryByRole('link', { name: 'Nueva venta' })).not.toBeInTheDocument();
  });

  it('marca el ambiente de pruebas y no etiqueta producción', () => {
    renderShell(
      <AppNavbar
        onToggleSidebar={vi.fn()}
        isSidebarOpen
        environment={{ environment: 'pruebas', label: 'Pruebas' }}
      />,
      [],
    );
    expect(screen.getByTestId('navbar-environment')).toHaveTextContent('Pruebas');
  });
});
