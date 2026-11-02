import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThirdPartyDto } from '@farmacia/contracts';
import * as accountingApi from '../src/features/accounting/api/accounting.api';
import * as thirdPartiesApi from '../src/features/third-parties/api/third-parties.api';
import { AccountingAuditPage } from '../src/features/accounting/pages/AccountingAuditPage';
import { AccountingLookupPage } from '../src/features/accounting/pages/AccountingLookupPage';
import { matchesAccount } from '../src/features/accounting/components/AccountAutocomplete';
import { appTheme } from '../src/theme/app-theme';

function renderPage(page: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider theme={appTheme}>
      <QueryClientProvider client={client}>
        <MemoryRouter>{page}</MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

const account = (code: string, name: string) =>
  ({
    id: code,
    code,
    name,
    type: 'ASSET',
    nature: 'DEBIT',
    parentId: null,
    level: 4,
    allowsMovement: true,
    isActive: true,
  }) as accountingApi.AccountDto;

beforeEach(() => vi.restoreAllMocks());

describe('Buscador rápido de cuentas', () => {
  it('coincide por el inicio del código o por cualquier parte del nombre', () => {
    const caja = account('110505', 'Caja general');
    expect(matchesAccount(caja, '1105')).toBe(true);
    expect(matchesAccount(caja, '0505')).toBe(false);
    expect(matchesAccount(caja, 'GENERAL')).toBe(true);
    expect(matchesAccount(caja, 'bancos')).toBe(false);
  });
});

describe('Auditoría contable', () => {
  it('muestra que no hay descuadres y consulta anulados con el tipo de documento elegido', async () => {
    const spy = vi
      .spyOn(accountingApi, 'fetchAccountingAudit')
      .mockImplementation(async (filters) => ({
        view: filters.view,
        documentTypes: ['SALE', 'RECEIVABLE_PAYMENT'],
        items:
          filters.view === 'ANULADOS'
            ? [
                {
                  journalEntryId: 'je-1',
                  date: '2026-10-20',
                  documentType: 'RECEIVABLE_PAYMENT',
                  documentId: 'pay-1',
                  documentNumber: null,
                  description: 'Abono cartera factura FAC-1',
                  totalDebit: '4000.00',
                  totalCredit: '4000.00',
                  difference: '0.00',
                  lineCount: 2,
                  reversalEntryId: 'je-2',
                  reversalDate: '2026-10-21',
                  reversalReason: 'Consignación devuelta',
                },
              ]
            : [],
      }));
    renderPage(<AccountingAuditPage />);
    expect(await screen.findByText(/No hay documentos descuadrados/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Anulados' }));
    expect(await screen.findByText('Consignación devuelta')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByLabelText('Tipo de documento'));
    fireEvent.click(await screen.findByRole('option', { name: 'Venta' }));
    await waitFor(() =>
      expect(spy).toHaveBeenLastCalledWith(
        expect.objectContaining({ view: 'ANULADOS', documentType: 'SALE' }),
      ),
    );
  });
});

describe('Consulta de terceros', () => {
  it('al elegir un tercero muestra lo que nos debe, lo que le debemos y el neto', async () => {
    vi.spyOn(accountingApi, 'fetchAccounts').mockResolvedValue([]);
    vi.spyOn(thirdPartiesApi, 'fetchThirdParties').mockResolvedValue({
      items: [
        {
          id: 'tp-1',
          documentType: 'NIT',
          documentNumber: '900777',
          name: 'Clínica Aliada',
        } as ThirdPartyDto,
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    const aging = (total: string) => ({
      current: { amount: total, count: 1 },
      days31To60: { amount: '0.00', count: 0 },
      days61To90: { amount: '0.00', count: 0 },
      daysOver90: { amount: '0.00', count: 0 },
      totalPending: total,
      totalCount: 1,
    });
    vi.spyOn(accountingApi, 'fetchThirdPartyStatement').mockResolvedValue({
      thirdPartyId: 'tp-1',
      name: 'Clínica Aliada',
      documentType: 'NIT',
      documentNumber: '900777',
      isCustomer: true,
      isSupplier: true,
      receivables: {
        items: [
          {
            receivableId: 'rec-1',
            invoiceNumber: 'FAC-0001',
            documentDate: '2026-10-01',
            dueDate: '2026-10-31',
            totalAmount: '10000.00',
            amountPaid: '4000.00',
            balance: '6000.00',
            daysOverdue: 1,
            agingBucket: 'CORRIENTE',
          },
        ],
        aging: aging('6000.00'),
      },
      payables: { items: [], aging: aging('2500.00') },
      totalOwedToUs: '6000.00',
      totalWeOwe: '2500.00',
      netBalance: '3500.00',
    });

    renderPage(<AccountingLookupPage />);
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Buscar tercero/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Clínica Aliada/ }));
    expect(await screen.findByText('Nos debe (cartera)')).toBeInTheDocument();
    expect(screen.getByText('FAC-0001')).toBeInTheDocument();
    expect(screen.getByText('$3.500,00')).toBeInTheDocument();
    expect(screen.getByText('A favor de la empresa')).toBeInTheDocument();
  });
});
