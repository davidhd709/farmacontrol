import type { ReactNode } from 'react';
import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ExpenseCategoryDto,
  ExpenseDto,
  PayablePaymentDto,
  ReceivablePaymentDto,
} from '@farmacia/contracts';
import { ExpenseFormDialog } from '../src/features/expenses/components/ExpenseFormDialog';
import { ExpenseReasonDialog } from '../src/features/expenses/components/ExpenseReasonDialog';
import { ExpensesPage } from '../src/features/expenses/pages/ExpensesPage';
import { ReceivableReversalDialog } from '../src/features/receivables/components/ReceivableReversalDialog';
import { PayableReversalDialog } from '../src/features/payables/components/PayableReversalDialog';
import * as api from '../src/features/expenses/api/expenses.api';
import * as receivables from '../src/features/receivables/api/receivables.api';
import * as payables from '../src/features/payables/api/payables.api';
import * as parties from '../src/features/third-parties/api/third-parties.api';
import { appTheme } from '../src/theme/app-theme';

const expense = {
  id: 'expense',
  beneficiary: 'Proveedor',
  description: 'Servicio',
  amount: '0.30',
  amountPaid: '0.00',
  balance: '0.30',
  paymentMethod: 'CREDITO',
  status: 'PENDIENTE',
  expenseDate: '2026-10-18',
  payments: [
    {
      id: 'payment',
      amount: '0.10',
      paymentMethod: 'EFECTIVO',
      paymentDate: '2026-10-18',
      isReversed: false,
    },
  ],
} as ExpenseDto;
const categories = [
  { id: 'category', name: 'Servicios', accountCode: '51', accountName: 'Servicios' },
] as ExpenseCategoryDto[];
function mount(content: ReactNode) {
  return render(
    <ThemeProvider theme={appTheme}>
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
          })
        }
      >
        {content}
      </QueryClientProvider>
    </ThemeProvider>,
  );
}
const change = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  vi.spyOn(parties, 'fetchThirdParties').mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
  });
});

describe('Causación de gastos', () => {
  const form = () =>
    mount(
      <ExpenseFormDialog
        categories={categories}
        onClose={vi.fn()}
        onSuccess={vi.fn().mockResolvedValue(undefined)}
      />,
    );
  it('rechaza el formulario vacío y lleva foco al beneficiario inválido', async () => {
    const spy = vi.spyOn(api, 'createExpense');
    form();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Gasto' }));
    expect(await screen.findByText('Selecciona el proveedor')).toBeInTheDocument();
    expect(screen.getByText('La descripción es obligatoria')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Proveedor/ })).toHaveFocus());
    expect(spy).not.toHaveBeenCalled();
  });

  it('causa sin medio de pago ni estado, valida el vencimiento y reutiliza clave tras error', async () => {
    let finish!: (value: ExpenseDto) => void;
    const spy = vi
      .spyOn(api, 'createExpense')
      .mockRejectedValueOnce(new Error('Sin conexión'))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
    form();
    vi.mocked(parties.fetchThirdParties).mockResolvedValue({
      items: [
        { id: 'tp-1', documentType: 'NIT', documentNumber: '', name: 'Proveedor', supplierId: 'sup-1' } as never,
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Proveedor/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Proveedor/ }));
    change(/Concepto \/ Descripción/, ' Servicio ');
    change(/Valor Total/, '0.30');
    change(/Nº Factura/, ' DOC-1 ');
    change('Notas / Observaciones', ' soporte ');
    change(/Fecha de Gasto/, '2026-10-18');
    expect(screen.queryByLabelText('Forma de Pago')).not.toBeInTheDocument();
    change(/Fecha de Vencimiento/, '2026-10-01');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Gasto' }));
    expect(await screen.findByText(/no puede ser anterior/)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    change(/Fecha de Vencimiento/, '2026-11-18');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Gasto' }));
    expect(await screen.findByText('Sin conexión')).toBeInTheDocument();
    const expected = {
      categoryId: 'category',
      supplierId: 'sup-1',
      beneficiary: 'Proveedor',
      description: 'Servicio',
      documentNumber: 'DOC-1',
      amount: '0.30',
      expenseDate: '2026-10-18',
      dueDate: '2026-11-18',
      notes: 'soporte',
    };
    expect(spy.mock.calls[0]).toEqual([expected, expect.any(String)]);
    const submit = screen.getByRole('button', { name: 'Confirmar Gasto' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy.mock.calls[1]).toEqual(spy.mock.calls[0]);
    expect(await screen.findByRole('button', { name: 'Guardando...' })).toBeDisabled();
    await act(async () => finish(expense));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirmar Gasto' })).toBeEnabled(),
    );
  });
});

it.each(['cancel', 'reverse'] as const)(
  'el motivo de gasto %s valida antes de enviar y conserva el texto para su mapeo actual',
  async (kind) => {
    const submit = vi.fn().mockResolvedValue(undefined);
    mount(<ExpenseReasonDialog kind={kind} onClose={vi.fn()} onSubmit={submit} />);
    const button = screen.getByRole('button', {
      name: kind === 'cancel' ? 'Confirmar Anulación' : 'Confirmar Reversión',
    });
    fireEvent.click(button);
    expect(await screen.findByText(/mínimo 5 caracteres/)).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
    change(/Motivo de la/, ' Motivo válido ');
    fireEvent.click(button);
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ reason: ' Motivo válido ' }));
  },
);

it.each(['receivable', 'payable'] as const)(
  'la reversión %s valida y mantiene el payload reason',
  async (kind) => {
    const payment = { id: 'payment', amount: '0.10', paymentMethod: 'EFECTIVO' };
    const spy =
      kind === 'receivable'
        ? vi.spyOn(receivables, 'revertReceivablePayment').mockResolvedValue({} as never)
        : vi.spyOn(payables, 'revertPayablePayment').mockResolvedValue({} as never);
    mount(
      kind === 'receivable' ? (
        <ReceivableReversalDialog
          accountId="account"
          payment={payment as ReceivablePaymentDto}
          onClose={vi.fn()}
        />
      ) : (
        <PayableReversalDialog
          accountId="account"
          payment={payment as PayablePaymentDto}
          onClose={vi.fn()}
        />
      ),
    );
    const button = screen.getByRole('button', {
      name: kind === 'receivable' ? 'Confirmar Anulación' : 'Confirmar Reversión',
    });
    fireEvent.click(button);
    expect(await screen.findByText(/El motivo es obligatorio/)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    change(/Motivo de la/, ' Motivo válido ');
    fireEvent.click(button);
    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith('account', 'payment', { reason: ' Motivo válido ' }),
    );
  },
);

it('integra los diálogos en gastos y conserva cancellationReason/reversalReason recortados', async () => {
  vi.spyOn(api, 'fetchExpenses').mockResolvedValue({
    items: [expense],
    total: 1,
    page: 1,
    pageSize: 15,
    totalPages: 1,
  });
  vi.spyOn(api, 'fetchExpensesSummary').mockResolvedValue({
    totalAmount: '0.30',
    totalPaid: '0.00',
    totalPending: '0.30',
  } as never);
  vi.spyOn(api, 'fetchExpenseCategories').mockResolvedValue(categories);
  const cancel = vi.spyOn(api, 'cancelExpense').mockResolvedValue(expense);
  const reverse = vi.spyOn(api, 'reverseExpensePayment').mockResolvedValue(expense);
  mount(<ExpensesPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Anular gasto' }));
  change(/Motivo de la Anulación/, ' Motivo válido ');
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar Anulación' }));
  await waitFor(() =>
    expect(cancel).toHaveBeenCalledWith('expense', { cancellationReason: 'Motivo válido' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Ver detalle del gasto' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Revertir pago' }));
  change(/Motivo de la Reversión/, ' Motivo válido ');
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar Reversión' }));
  await waitFor(() =>
    expect(reverse).toHaveBeenCalledWith('payment', { reversalReason: 'Motivo válido' }),
  );
});
