import { ThemeProvider } from '@mui/material';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PayableDto, ReceivableDto } from '@farmacia/contracts';
import { ReceivablePaymentDialog } from '../src/features/receivables/components/ReceivablePaymentDialog';
import { PayablePaymentDialog } from '../src/features/payables/components/PayablePaymentDialog';
import * as receivables from '../src/features/receivables/api/receivables.api';
import * as payables from '../src/features/payables/api/payables.api';
import * as treasury from '../src/features/treasury/hooks/useTreasury';
import { appTheme } from '../src/theme/app-theme';

const account: ReceivableDto & PayableDto = {
  id: 'account',
  saleId: 'sale',
  customerId: 'customer',
  purchaseId: 'purchase',
  supplierId: 'supplier',
  notes: null,
  createdAt: '2026-10-18T12:00:00.000Z',
  updatedAt: '2026-10-18T12:00:00.000Z',
  invoiceNumber: 'FAC-1',
  totalAmount: '0.30',
  amountPaid: '0.00',
  balance: '0.30',
  status: 'PENDIENTE',
  dueDate: '2099-01-01',
  payments: [],
};
function wrapper(children: React.ReactNode) {
  return render(
    <ThemeProvider theme={appTheme}>
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
          })
        }
      >
        {children}
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  vi.spyOn(treasury, 'useBankAccountOptions').mockReturnValue({
    data: [{ id: 'bank', name: 'Principal', bankName: 'Banco' }],
    isPending: false,
    isError: false,
  } as ReturnType<typeof treasury.useBankAccountOptions>);
  vi.spyOn(receivables, 'fetchReceivableById').mockResolvedValue(account as ReceivableDto);
  vi.spyOn(payables, 'fetchPayableById').mockResolvedValue(account as PayableDto);
});

describe.each([
  {
    name: 'cartera',
    component: () => (
      <ReceivablePaymentDialog
        receivable={account as ReceivableDto}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    ),
    api: receivables,
    fn: 'registerReceivablePayment' as const,
    amount: 'Monto del abono',
    submit: 'Registrar Abono',
    confirm: 'Confirmar y Abonar',
  },
  {
    name: 'proveedores',
    component: () => (
      <PayablePaymentDialog payable={account as PayableDto} onClose={vi.fn()} onSuccess={vi.fn()} />
    ),
    api: payables,
    fn: 'registerPayablePayment' as const,
    amount: 'Monto del pago',
    submit: 'Pagar Proveedor',
    confirm: 'Confirmar y Pagar',
  },
])('Formulario de $name', (config) => {
  const apiSpy = () =>
    config.fn === 'registerReceivablePayment'
      ? vi.spyOn(receivables, config.fn)
      : vi.spyOn(payables, config.fn);
  it('no envía errores ni importes superiores al saldo y enfoca el campo inválido', async () => {
    const spy = apiSpy();
    wrapper(config.component());
    const amount = screen.getByLabelText(config.amount);
    fireEvent.change(amount, { target: { value: '0.31' } });
    fireEvent.click(screen.getByRole('button', { name: config.submit }));
    expect(
      await screen.findByText('El monto no puede superar el saldo pendiente'),
    ).toBeInTheDocument();
    await waitFor(() => expect(amount).toHaveFocus());
    expect(spy).not.toHaveBeenCalled();
    fireEvent.change(amount, { target: { value: '0.001' } });
    fireEvent.click(screen.getByRole('button', { name: config.submit }));
    expect(await screen.findByText(/máximo 2 decimales/)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('exige banco en transferencia y muestra ayuda por campo', async () => {
    const spy = apiSpy();
    wrapper(config.component());
    fireEvent.change(screen.getByLabelText(config.amount), { target: { value: '0.30' } });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Método de pago' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Transferencia' }));
    fireEvent.click(screen.getByRole('button', { name: config.submit }));
    expect(await screen.findByText('Selecciona la cuenta bancaria')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('mantiene payload exacto y clave tras error de red, y bloquea el doble clic', async () => {
    let finish!: (value: typeof account) => void;
    const spy = apiSpy()
      .mockRejectedValueOnce(new Error('Sin conexión'))
      .mockImplementationOnce(
        () =>
          new Promise<typeof account>((resolve) => {
            finish = resolve;
          }),
      );
    wrapper(config.component());
    fireEvent.change(screen.getByLabelText(config.amount), { target: { value: '0.30' } });
    fireEvent.click(screen.getByRole('button', { name: config.submit }));
    fireEvent.click(await screen.findByRole('button', { name: config.confirm }));
    expect(await screen.findByText('Sin conexión')).toBeInTheDocument();
    const [id, payload, key] = spy.mock.calls[0];
    expect(id).toBe('account');
    expect(payload).toEqual({
      amount: '0.30',
      paymentMethod: 'EFECTIVO',
      bankAccountId: undefined,
      notes: null,
    });
    expect(key).toEqual(expect.any(String));
    fireEvent.click(await screen.findByRole('button', { name: config.submit }));
    const confirm = await screen.findByRole('button', { name: config.confirm });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy.mock.calls[1]).toEqual([id, payload, key]);
    await waitFor(() => expect(screen.getByRole('button', { name: /Registrando/ })).toBeDisabled());
    await act(async () => finish(account));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Registrando/ })).not.toBeInTheDocument(),
    );
  });

  it('el envío válido por transferencia conserva cuenta y notas sin recortar', async () => {
    const spy = apiSpy().mockResolvedValue(account);
    wrapper(config.component());
    fireEvent.change(screen.getByLabelText(config.amount), { target: { value: '0.20' } });
    fireEvent.change(screen.getByLabelText(/Observaciones/), { target: { value: ' soporte ' } });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Método de pago' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Transferencia' }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Cuenta/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Principal/ }));
    fireEvent.click(await screen.findByRole('button', { name: config.submit }));
    const confirm = await screen.findByRole('button', { name: config.confirm });
    expect(
      within(confirm.closest('[role="dialog"]')!).getByText(/TRANSFERENCIA/),
    ).toBeInTheDocument();
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        'account',
        {
          amount: '0.20',
          paymentMethod: 'TRANSFERENCIA',
          bankAccountId: 'bank',
          notes: ' soporte ',
        },
        expect.any(String),
      ),
    );
  });
});
