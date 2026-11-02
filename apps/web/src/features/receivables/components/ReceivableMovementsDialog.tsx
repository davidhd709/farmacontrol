import { useState } from 'react';
import { Alert } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { SYSTEM_PERMISSIONS, type DocumentMovementDto } from '@farmacia/contracts';
import { fetchReceivableMovements } from '../api/receivables.api';
import { DocumentMovementsDialog } from '../../../components/DocumentMovementsDialog';
import { formatMoney } from '../../../components/DocumentMovementsTable';
import { usePermissions } from '../../auth/hooks/usePermissions';
import { ReceivableReversalDialog } from './ReceivableReversalDialog';
import { getStatusDisplay } from '../utils/status';

/**
 * "Ver abonos": todos los movimientos de una factura a crédito con su recibo de caja y el saldo
 * después de cada uno. Los abonos se registran con un recibo de caja en Tesorería; aquí solo se
 * pueden revertir.
 */
export function ReceivableMovementsDialog({
  receivableId,
  onClose,
}: {
  receivableId: string;
  onClose: () => void;
}) {
  const { hasPermission } = usePermissions();
  const [reversal, setReversal] = useState<DocumentMovementDto | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['receivable-movements', receivableId],
    queryFn: () => fetchReceivableMovements(receivableId),
  });

  return (
    <>
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
                { label: 'Abonado', value: formatMoney(data.amountPaid) },
                { label: 'Saldo', value: formatMoney(data.balance) },
              ]
            : []
        }
        onReverse={hasPermission(SYSTEM_PERMISSIONS.RECEIVABLES_MANAGE) ? setReversal : undefined}
        footer={
          data?.status === 'PENDIENTE' && (
            <Alert severity="info" variant="outlined">
              Para abonar, registra un recibo de caja en Tesorería → Recibos de caja.
            </Alert>
          )
        }
        onClose={onClose}
      />
      {reversal?.paymentId && (
        <ReceivableReversalDialog
          accountId={receivableId}
          payment={{
            id: reversal.paymentId,
            amount: reversal.credit,
            paymentMethod: reversal.paymentMethod ?? 'EFECTIVO',
          }}
          onClose={() => setReversal(null)}
        />
      )}
    </>
  );
}
