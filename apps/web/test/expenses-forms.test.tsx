import type { ReactNode } from 'react';
import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExpenseCategoryDto, ExpenseDto, PayablePaymentDto } from '@farmacia/contracts';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import { withAuth } from './support-auth';
import { ExpensesWithoutSupplierDialog } from '../src/features/expenses/components/ExpensesWithoutSupplierDialog';
import { ExpenseFormDialog } from '../src/features/expenses/components/ExpenseFormDialog';
import { ExpenseReasonDialog } from '../src/features/expenses/components/ExpenseReasonDialog';
import { ExpensesPage } from '../src/features/expenses/pages/ExpensesPage';
import { PayableReversalDialog } from '../src/features/payables/components/PayableReversalDialog';
import * as api from '../src/features/expenses/api/expenses.api';
import * as payables from '../src/features/payables/api/payables.api';
import * as parties from '../src/features/third-parties/api/third-parties.api';
import { appTheme } from '../src/theme/app-theme';
import { MemoryRouter } from 'react-router-dom';
import { setDateField } from './support-date';

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
function mount(content: ReactNode, initialEntries: string[] = ['/']) {
  return render(
    <ThemeProvider theme={appTheme}>
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
          })
        }
      >
        <MemoryRouter initialEntries={initialEntries}>{content}</MemoryRouter>
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
        {
          id: 'tp-1',
          documentType: 'NIT',
          documentNumber: '',
          name: 'Proveedor',
          supplierId: 'sup-1',
        } as never,
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
    setDateField(/Fecha de Gasto/, '2026-10-18');
    expect(screen.queryByLabelText('Forma de Pago')).not.toBeInTheDocument();
    setDateField(/Fecha de Vencimiento/, '2026-10-01');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar Gasto' }));
    expect(await screen.findByText(/no puede ser anterior/)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    setDateField(/Fecha de Vencimiento/, '2026-11-18');
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
      name: kind === 'cancel' ? 'Anular gasto' : 'Revertir pago',
    });
    change(/Motivo de la/, ' abc ');
    fireEvent.click(button);
    expect(await screen.findByText(/al menos 5 caracteres/)).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
    change(/Motivo de la/, ' Motivo válido ');
    fireEvent.click(button);
    // La confirmación común entrega el motivo recortado
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ reason: 'Motivo válido' }));
  },
);

it('la reversión de un pago a proveedor valida el motivo y lo envía recortado', async () => {
  const payment = { id: 'payment', amount: '0.10', paymentMethod: 'EFECTIVO' };
  const spy = vi.spyOn(payables, 'revertPayablePayment').mockResolvedValue({} as never);
  mount(
    <PayableReversalDialog
      accountId="account"
      payment={payment as PayablePaymentDto}
      onClose={vi.fn()}
    />,
  );
  const button = screen.getByRole('button', { name: 'Revertir pago' });
  fireEvent.click(button);
  expect(await screen.findByText('Escribe el motivo.')).toBeInTheDocument();
  expect(spy).not.toHaveBeenCalled();
  change(/Motivo de la/, ' Motivo válido ');
  fireEvent.click(button);
  await waitFor(() =>
    expect(spy).toHaveBeenCalledWith('account', 'payment', { reason: 'Motivo válido' }),
  );
});

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
  mount(
    withAuth(<ExpensesPage />, [
      SYSTEM_PERMISSIONS.EXPENSES_MANAGE,
      SYSTEM_PERMISSIONS.DISBURSEMENTS_ANNUL,
    ]),
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Anular gasto' }));
  change(/Motivo de la anulación/, ' Motivo válido ');
  fireEvent.click(screen.getByRole('button', { name: 'Anular gasto' }));
  await waitFor(() =>
    expect(cancel).toHaveBeenCalledWith('expense', { cancellationReason: 'Motivo válido' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Ver detalle del gasto' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Revertir pago' }));
  change(/Motivo de la reversión/, ' Motivo válido ');
  fireEvent.click(screen.getByRole('button', { name: 'Revertir pago' }));
  await waitFor(() =>
    expect(reverse).toHaveBeenCalledWith('payment', { reversalReason: 'Motivo válido' }),
  );
});

it('sin comprobante_egreso.anular (supervisor) el detalle no ofrece revertir el pago', async () => {
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
  mount(withAuth(<ExpensesPage />, [SYSTEM_PERMISSIONS.EXPENSES_MANAGE]));
  fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle del gasto' }));
  // La fila del pago vigente se muestra, sin la acción de revertir
  expect(await screen.findByText('$0,10')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Revertir pago' })).toBeNull();
});

it('abre el detalle del gasto que pide la URL (desde un recibo o egreso automático)', async () => {
  vi.spyOn(api, 'fetchExpenses').mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 15,
    totalPages: 1,
  });
  vi.spyOn(api, 'fetchExpensesSummary').mockResolvedValue({
    totalAmount: '0.00',
    totalPaid: '0.00',
    totalPending: '0.00',
  } as never);
  vi.spyOn(api, 'fetchExpenseCategories').mockResolvedValue(categories);
  const byId = vi.spyOn(api, 'fetchExpenseById').mockResolvedValue(expense);
  mount(withAuth(<ExpensesPage />, [SYSTEM_PERMISSIONS.EXPENSES_MANAGE]), [
    '/expenses?gasto=expense',
  ]);
  expect(await screen.findByText('Detalle de Gasto e Historial de Pagos')).toBeInTheDocument();
  expect(byId).toHaveBeenCalledWith('expense');
  expect(await screen.findByText('$0,10')).toBeInTheDocument();
});

it('lista las causaciones sin proveedor y asigna uno con confirmación', async () => {
  vi.spyOn(api, 'fetchExpensesWithoutSupplier').mockResolvedValue([
    {
      id: 'exp-old',
      expenseDate: '2026-08-10',
      documentNumber: null,
      description: 'Energía agosto',
      beneficiary: 'Texto libre',
      categoryName: 'Servicios',
      amount: '45000.00',
      balance: '45000.00',
      status: 'PENDIENTE',
    },
  ]);
  const assign = vi.spyOn(api, 'assignExpenseSupplier').mockResolvedValue({
    ...expense,
    supplierName: 'Enel',
    description: 'Energía agosto',
  } as ExpenseDto);
  vi.mocked(parties.fetchThirdParties).mockResolvedValue({
    items: [
      {
        id: 'tp-1',
        documentType: 'NIT',
        documentNumber: '860',
        name: 'Enel',
        supplierId: 'sup-1',
      } as never,
    ],
    total: 1,
    page: 1,
    pageSize: 20,
    totalPages: 1,
  });
  mount(<ExpensesWithoutSupplierDialog canAssign onClose={vi.fn()} />);
  expect(await screen.findByText('Energía agosto')).toBeInTheDocument();
  expect(screen.getByText('10/08/2026')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Asignar proveedor' }));
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /Proveedor/ }));
  fireEvent.click(await screen.findByRole('option', { name: /Enel/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Revisar asignación' }));
  const confirm = await screen.findByRole('dialog', {
    name: '¿Asignar el proveedor a la causación?',
  });
  expect(within(confirm).getByTestId('confirm-effects')).toHaveTextContent(
    'Queda a nombre de Enel y aparece en su estado de cuenta.',
  );
  fireEvent.click(within(confirm).getByRole('button', { name: 'Asignar proveedor' }));
  await waitFor(() => expect(assign).toHaveBeenCalledWith('exp-old', 'sup-1'));
});
