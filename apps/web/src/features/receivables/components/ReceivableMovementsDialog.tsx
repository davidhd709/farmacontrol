import { Alert } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { fetchReceivableMovements } from '../api/receivables.api';
import { DocumentMovementsDialog } from '../../../components/DocumentMovementsDialog';
import { formatMoney } from '../../../components/DocumentMovementsTable';
import { getStatusDisplay } from '../utils/status';

/**
 * "Ver abonos": vista exclusivamente de consulta con todos los movimientos de una factura a crédito,
 * su valor original, recibos de caja aplicados y el saldo después de cada movimiento (REQ-001).
 */
export function ReceivableMovementsDialog({
  receivableId,
  onClose,
}: {
  receivableId: string;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['receivable-movements', receivableId],
    queryFn: () => fetchReceivableMovements(receivableId),
  });

  return (
    <DocumentMovementsDialog
      title={`Abonos de la factura ${data?.invoiceNumber ?? ''}`}
      loading={isLoading}
      error={error as Error | null}
      movements={data?.movements}
      summary={
        data
          ? [
              { label: 'Cliente', value: data.customerName ?? '—' },
              { label: 'Vence', value: data.dueDate },
              { label: 'Estado', value: getStatusDisplay(data.status).label },
              { label: 'Valor original', value: formatMoney(data.totalAmount) },
              { label: 'Abonado', value: formatMoney(data.amountPaid) },
              { label: 'Saldo', value: formatMoney(data.balance) },
            ]
          : []
      }
      footer={
        data?.status === 'PENDIENTE' && (
          <Alert severity="info" variant="outlined">
            Módulo de solo consulta. Para registrar o gestionar abonos, utiliza Tesorería → Recibos de Caja.
          </Alert>
        )
      }
      onClose={onClose}
    />
  );
}
