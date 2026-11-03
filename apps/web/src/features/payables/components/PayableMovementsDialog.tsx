import { useState } from 'react';
import { Alert } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { SYSTEM_PERMISSIONS, type DocumentMovementDto } from '@farmacia/contracts';
import { fetchPayableMovements } from '../api/payables.api';
import { DocumentMovementsDialog } from '../../../components/DocumentMovementsDialog';
import { formatMoney } from '../../../components/DocumentMovementsTable';
import { usePermissions } from '../../auth/hooks/usePermissions';
import { PayableReversalDialog } from './PayableReversalDialog';
import { statusConfig } from '../utils/status';

/**
 * Detalle de una factura de compra: cargo, notas débito, pagos con su comprobante de egreso y
 * saldo. Los pagos se registran con un comprobante de egreso; aquí solo se pueden revertir.
 */
export function PayableMovementsDialog({
  payableId,
  onClose,
}: {
  payableId: string;
  onClose: () => void;
}) {
  const { hasPermission } = usePermissions();
  const [reversal, setReversal] = useState<DocumentMovementDto | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ['payable-movements', payableId],
    queryFn: () => fetchPayableMovements(payableId),
  });

  return (
    <>
      <DocumentMovementsDialog
        title={`Factura de compra ${data?.invoiceNumber ?? ''}`}
        loading={isLoading}
        error={error as Error | null}
        movements={data?.movements}
        creditLabel="Pago"
        summary={
          data
            ? [
                { label: 'Proveedor', value: data.supplierName ?? '—' },
                { label: 'Vence', value: data.dueDate },
                {
                  label: 'Estado',
                  value: statusConfig[data.status as keyof typeof statusConfig]?.label ?? data.status,
                },
                { label: 'Pagado', value: formatMoney(data.amountPaid) },
                { label: 'Saldo', value: formatMoney(data.balance) },
              ]
            : []
        }
        onReverse={
          hasPermission(SYSTEM_PERMISSIONS.PAYABLES_MANAGE) &&
          hasPermission(SYSTEM_PERMISSIONS.DISBURSEMENTS_ANNUL)
            ? setReversal
            : undefined
        }
        footer={
          data?.status === 'PENDIENTE' && (
            <Alert severity="info" variant="outlined">
              Para pagar, registra un comprobante de egreso en Tesorería → Comprobantes de egreso.
            </Alert>
          )
        }
        onClose={onClose}
      />
      {reversal?.paymentId && (
        <PayableReversalDialog
          accountId={payableId}
          payment={{ id: reversal.paymentId, paymentMethod: reversal.paymentMethod ?? 'EFECTIVO' }}
          onClose={() => setReversal(null)}
        />
      )}
    </>
  );
}
