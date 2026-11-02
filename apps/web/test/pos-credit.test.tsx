import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as salesApi from '../src/features/sales/api/sales.api';
import { PosPaymentDialog } from '../src/features/sales/components/PosPaymentDialog';
import { appTheme } from '../src/theme/app-theme';

function renderDialog(props: { customerIsDefault: boolean; onConfirm: ReturnType<typeof vi.fn> }) {
  vi.spyOn(salesApi, 'fetchFefoPreview').mockResolvedValue({ lines: [] } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider theme={appTheme}>
      <QueryClientProvider client={client}>
        <PosPaymentDialog
          open
          total={12000}
          items={[{ productId: 'p-1', quantityCommercial: 1 }]}
          productNames={{ 'p-1': 'Acetaminofén' }}
          customerName="Marta Crédito"
          customerIsDefault={props.customerIsDefault}
          onClose={vi.fn()}
          onConfirm={props.onConfirm}
          loading={false}
        />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('POS: condición Contado / Crédito', () => {
  it('a crédito confirma sin efectivo recibido y anuncia la cuenta por cobrar', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderDialog({ customerIsDefault: false, onConfirm });
    fireEvent.click(screen.getByRole('button', { name: 'Crédito' }));
    expect(screen.getByText(/Se creará una cuenta por cobrar/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Efectivo Recibido/)).not.toBeInTheDocument();
    const confirm = await screen.findByTestId('confirm-payment-btn');
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith('CREDITO', 0, undefined, undefined));
  });

  it('no permite vender a crédito al consumidor final', async () => {
    const onConfirm = vi.fn();
    renderDialog({ customerIsDefault: true, onConfirm });
    fireEvent.click(screen.getByRole('button', { name: 'Crédito' }));
    expect(screen.getByText(/selecciona un cliente identificado/)).toBeInTheDocument();
    expect(screen.getByTestId('confirm-payment-btn')).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
