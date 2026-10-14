import { ThemeProvider } from '@mui/material';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaleDto } from '@farmacia/contracts';
import { SaleReceiptDialog } from '../src/features/sales/components/SaleReceiptDialog';
import { appTheme } from '../src/theme/app-theme';

const mockSaleA: SaleDto = {
  id: 'sale-A',
  invoiceNumber: 'VEN-20261013-0001',
  customerId: 'cust-1',
  customerName: 'Carlos Gómez',
  customerDocument: '10203040',
  status: 'COMPLETED',
  paymentMethod: 'EFECTIVO',
  subtotal: 15000,
  taxTotal: 0,
  discountTotal: 1000,
  total: 14000,
  amountPaid: 20000,
  changeGiven: 6000,
  createdById: 'user-1',
  createdByUsername: 'cajero_pos',
  lines: [
    {
      id: 'line-1',
      productId: 'prod-1',
      productName: 'Amoxicilina 500mg',
      presentationFactorHistorical: 1,
      quantityCommercial: 2,
      quantityBaseUnits: 2,
      unitPrice: 7500,
      discount: 500,
      subtotal: 15000,
      taxRate: 0,
      taxAmount: 0,
      total: 14000,
      lotAllocations: [
        {
          id: 'alloc-1',
          lotId: 'lot-1',
          lotNumber: 'LOT-AMX-01',
          expirationDate: '2027-10-01',
          quantityBaseUnits: 2,
        },
      ],
    },
  ],
  createdAt: '2026-10-13T10:00:00.000Z',
};

const mockSaleB: SaleDto = {
  id: 'sale-B',
  invoiceNumber: 'VEN-20261013-0002',
  customerId: 'cust-2',
  customerName: 'María Rodríguez',
  customerDocument: '50607080',
  status: 'COMPLETED',
  paymentMethod: 'TARJETA_DEBITO',
  subtotal: 30000,
  taxTotal: 0,
  discountTotal: 0,
  total: 30000,
  amountPaid: 30000,
  changeGiven: 0,
  createdById: 'user-1',
  createdByUsername: 'cajero_pos',
  lines: [
    {
      id: 'line-2',
      productId: 'prod-2',
      productName: 'Ibuprofeno 400mg',
      presentationName: 'Caja x 10',
      presentationFactorHistorical: 10,
      quantityCommercial: 1,
      quantityBaseUnits: 10,
      unitPrice: 30000,
      discount: 0,
      subtotal: 30000,
      taxRate: 0,
      taxAmount: 0,
      total: 30000,
    },
  ],
  createdAt: '2026-10-13T11:00:00.000Z',
};

describe('SaleReceiptDialog — Integridad de Hooks de React (FARM-AUD-013)', () => {
  let consoleErrors: string[] = [];
  const originalConsoleError = console.error;

  beforeEach(() => {
    consoleErrors = [];
    console.error = (...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
      originalConsoleError(...args);
    };
  });

  const renderDialog = (props: {
    open: boolean;
    sale: SaleDto | null;
    onClose?: () => void;
    onNewSale?: () => void;
  }) => {
    return render(
      <ThemeProvider theme={appTheme}>
        <SaleReceiptDialog
          open={props.open}
          sale={props.sale}
          onClose={props.onClose || vi.fn()}
          onNewSale={props.onNewSale}
        />
      </ThemeProvider>,
    );
  };

  it('Caso 1 — Sin venta: no renderiza diálogo ni produce errores de React', () => {
    const { container } = renderDialog({ open: false, sale: null });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(consoleErrors).toHaveLength(0);
  });

  it('Caso 2 — Apertura: transición de sale = null a venta válida sin violar reglas de hooks', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <ThemeProvider theme={appTheme}>
        <SaleReceiptDialog open={false} sale={null} onClose={onClose} />
      </ThemeProvider>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Transición a diálogo abierto con venta válida
    rerender(
      <ThemeProvider theme={appTheme}>
        <SaleReceiptDialog open={true} sale={mockSaleA} onClose={onClose} />
      </ThemeProvider>,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Comprobante N°: VEN-20261013-0001/i)).toBeInTheDocument();
    expect(screen.getByText('Carlos Gómez (10203040)')).toBeInTheDocument();
    expect(screen.getByText('Amoxicilina 500mg')).toBeInTheDocument();

    // No debe haber warnings o errores internos de React por cantidad desigual de hooks
    const hasHookViolation = consoleErrors.some(
      (err) =>
        err.includes('Expected static flag was missing') ||
        err.includes('Rendered more hooks than during the previous render') ||
        err.includes('Rendered fewer hooks than expected'),
    );
    expect(hasHookViolation).toBe(false);
  });

  it('Caso 3 — Cierre: transición de venta válida a sale = null sin errores', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <ThemeProvider theme={appTheme}>
        <SaleReceiptDialog open={true} sale={mockSaleA} onClose={onClose} />
      </ThemeProvider>,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Cierre
    rerender(
      <ThemeProvider theme={appTheme}>
        <SaleReceiptDialog open={false} sale={null} onClose={onClose} />
      </ThemeProvider>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const hasHookViolation = consoleErrors.some(
      (err) =>
        err.includes('Expected static flag was missing') ||
        err.includes('Rendered more hooks than during the previous render') ||
        err.includes('Rendered fewer hooks than expected'),
    );
    expect(hasHookViolation).toBe(false);
  });

  it('Caso 4 — Reapertura: ciclo abrir -> cerrar -> reabrir sin efectos duplicados', () => {
    const onNewSale = vi.fn();
    const onClose = vi.fn();

    const { rerender } = render(
      <ThemeProvider theme={appTheme}>
        <SaleReceiptDialog open={false} sale={null} onClose={onClose} onNewSale={onNewSale} />
      </ThemeProvider>,
    );

    // 1. Abrir
    rerender(
      <ThemeProvider theme={appTheme}>
        <SaleReceiptDialog open={true} sale={mockSaleA} onClose={onClose} onNewSale={onNewSale} />
      </ThemeProvider>,
    );
    expect(screen.getByText(/VEN-20261013-0001/i)).toBeInTheDocument();

    // 2. Cerrar
    rerender(
      <ThemeProvider theme={appTheme}>
        <SaleReceiptDialog open={false} sale={null} onClose={onClose} onNewSale={onNewSale} />
      </ThemeProvider>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // 3. Reabrir
    rerender(
      <ThemeProvider theme={appTheme}>
        <SaleReceiptDialog open={true} sale={mockSaleA} onClose={onClose} onNewSale={onNewSale} />
      </ThemeProvider>,
    );
    expect(screen.getByText(/VEN-20261013-0001/i)).toBeInTheDocument();

    // Pulsar Enter para verificar que el listener de teclado no se duplicó
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onNewSale).toHaveBeenCalledTimes(1);

    const hasHookViolation = consoleErrors.some((err) =>
      err.includes('Expected static flag was missing'),
    );
    expect(hasHookViolation).toBe(false);
  });

  it('Caso 5 — Ventas diferentes: cambiar de Venta A a Venta B muestra los datos de B limpiamente', () => {
    const { rerender } = render(
      <ThemeProvider theme={appTheme}>
        <SaleReceiptDialog open={true} sale={mockSaleA} onClose={vi.fn()} />
      </ThemeProvider>,
    );

    expect(screen.getByText(/VEN-20261013-0001/i)).toBeInTheDocument();
    expect(screen.getByText('Carlos Gómez (10203040)')).toBeInTheDocument();
    expect(screen.getByText('Amoxicilina 500mg')).toBeInTheDocument();

    // Cambiar a Venta B
    rerender(
      <ThemeProvider theme={appTheme}>
        <SaleReceiptDialog open={true} sale={mockSaleB} onClose={vi.fn()} />
      </ThemeProvider>,
    );

    expect(screen.queryByText(/VEN-20261013-0001/i)).not.toBeInTheDocument();
    expect(screen.getByText(/VEN-20261013-0002/i)).toBeInTheDocument();
    expect(screen.getByText('María Rodríguez (50607080)')).toBeInTheDocument();
    expect(screen.getByText('Ibuprofeno 400mg')).toBeInTheDocument();
    expect(screen.getByText(/Pres: Caja x 10/i)).toBeInTheDocument();
  });

  it('Caso 8 — React StrictMode: renderizado estable y sin warnings', () => {
    render(
      <StrictMode>
        <ThemeProvider theme={appTheme}>
          <SaleReceiptDialog open={true} sale={mockSaleA} onClose={vi.fn()} />
        </ThemeProvider>
      </StrictMode>,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/VEN-20261013-0001/i)).toBeInTheDocument();

    const hasHookViolation = consoleErrors.some((err) =>
      err.includes('Expected static flag was missing'),
    );
    expect(hasHookViolation).toBe(false);
  });

  it('Caso 9 — Impresión: invoca window.print() correctamente', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => undefined);

    renderDialog({ open: true, sale: mockSaleA });

    const printBtn = screen.getByRole('button', { name: /Imprimir Comprobante/i });
    fireEvent.click(printBtn);

    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });
});
