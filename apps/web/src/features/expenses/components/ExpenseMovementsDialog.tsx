import { Alert } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { fetchExpenseMovements } from '../api/expenses.api';
import { DocumentMovementsDialog } from '../../../components/DocumentMovementsDialog';
import { formatMoney } from '../../../components/DocumentMovementsTable';

/** Detalle de una causación de gasto: el pasivo, sus pagos con su comprobante de egreso y saldo. */
export function ExpenseMovementsDialog({
  expenseId,
  onClose,
}: {
  expenseId: string;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['expense-movements', expenseId],
    queryFn: () => fetchExpenseMovements(expenseId),
  });
  return (
    <DocumentMovementsDialog
      title={`Causación ${data?.documentNumber ?? data?.description ?? ''}`}
      loading={isLoading}
      error={error as Error | null}
      movements={data?.movements}
      creditLabel="Pago"
      summary={
        data
          ? [
              { label: 'Proveedor', value: data.supplierName },
              { label: 'Concepto', value: data.description },
              { label: 'Vence', value: data.dueDate ?? '—' },
              { label: 'Pagado', value: formatMoney(data.amountPaid) },
              { label: 'Saldo', value: formatMoney(data.balance) },
            ]
          : []
      }
      footer={
        Number(data?.balance ?? 0) > 0 &&
        data?.status !== 'ANULADO' && (
          <Alert severity="info" variant="outlined">
            Para pagar, registra un comprobante de egreso en Tesorería → Comprobantes de egreso.
          </Alert>
        )
      }
      onClose={onClose}
    />
  );
}
