import { ThemeProvider } from '@mui/material';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaleDto } from '@farmacia/contracts';
import * as accountingApi from '../src/features/accounting/api/accounting.api';
import { CreditNoteDialog } from '../src/features/sales/components/CreditNoteDialog';
import { appTheme } from '../src/theme/app-theme';

vi.mock('../src/features/accounting/api/accounting.api', async (orig) => ({
  ...(await orig<typeof accountingApi>()),
  createSaleCreditNote: vi.fn(),
}));

const sale: SaleDto = {
  id: 'sale-1',
  invoiceNumber: 'VEN-0001',
  customerId: 'c-1',
  customerName: 'Consumidor Final',
  customerDocument: '222222222222',
  status: 'COMPLETED',
  paymentMethod: 'EFECTIVO',
  subtotal: 2900,
  taxTotal: 0,
  discountTotal: 100,
  total: 2900,
  amountPaid: 3000,
  changeGiven: 100,
  createdById: 'u-1',
  lines: [
    {
      id: 'line-1',
      productId: 'p-1',
      productName: 'Loratadina 10mg',
      presentationFactorHistorical: 1,
      quantityCommercial: 3,
      quantityBaseUnits: 3,
      unitPrice: 1000,
      discount: 100,
      subtotal: 2900,
      taxRate: 0,
      taxAmount: 0,
      total: 2900,
      lotAllocations: [],
    },
  ],
  createdAt: '2026-10-07T12:00:00.000Z',
};

function renderDialog(s: SaleDto = sale) {
  return render(
    <ThemeProvider theme={appTheme}>
      <CreditNoteDialog open sale={s} onClose={vi.fn()} onCreated={vi.fn()} />
    </ThemeProvider>,
  );
}

describe('CreditNoteDialog (AUD-007)', () => {
  beforeEach(() => {
    vi.mocked(accountingApi.createSaleCreditNote).mockReset();
  });

  it('solo ofrece formas de reembolso con contrapartida según el medio de pago de la venta', () => {
    renderDialog();
    fireEvent.mouseDown(screen.getByLabelText('Forma de reembolso'));
    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByText(/Efectivo/)).toBeInTheDocument();
    expect(within(listbox).queryByText(/Saldo a favor/)).not.toBeInTheDocument();
    expect(within(listbox).queryByText(/cartera/)).not.toBeInTheDocument();
    expect(within(listbox).queryByText(/Transferencia/)).not.toBeInTheDocument();
  });

  it('estima el reembolso sobre el valor neto cobrado (con descuento)', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Cantidad a devolver de Loratadina 10mg'), {
      target: { value: '3' },
    });
    expect(screen.getByText(/Impacto estimado: \$2\.900,00/)).toBeInTheDocument();
  });

  it('reintenta con la misma Idempotency-Key tras un fallo', async () => {
    vi.mocked(accountingApi.createSaleCreditNote)
      .mockRejectedValueOnce(new Error('Sin conexión'))
      .mockResolvedValueOnce({ creditNoteNumber: 'NC-000001' } as never);
    renderDialog();
    fireEvent.change(screen.getByLabelText('Cantidad a devolver de Loratadina 10mg'), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByLabelText(/Motivo/i), { target: { value: 'Empaque dañado' } });

    const submit = screen.getByRole('button', { name: /Registrar|Emitir|Confirmar/i });
    fireEvent.click(submit);
    await waitFor(() => expect(accountingApi.createSaleCreditNote).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);
    await waitFor(() => expect(accountingApi.createSaleCreditNote).toHaveBeenCalledTimes(2));

    const [, , firstKey] = vi.mocked(accountingApi.createSaleCreditNote).mock.calls[0];
    const [, , secondKey] = vi.mocked(accountingApi.createSaleCreditNote).mock.calls[1];
    expect(firstKey).toBeTruthy();
    expect(secondKey).toBe(firstKey);
  });
});
