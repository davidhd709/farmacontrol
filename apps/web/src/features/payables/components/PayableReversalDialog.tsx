import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { formatMoney } from '../../../components/DocumentMovementsTable';
import { revertPayablePayment } from '../api/payables.api';

interface Props {
  accountId: string;
  payment: {
    id: string;
    paymentMethod: string;
    amount?: string | null;
    /** Comprobante de egreso con que se hizo el pago */
    documentNumber?: string | null;
    date?: string | null;
  };
  /** Factura de compra a la que vuelve el saldo */
  invoiceNumber?: string | null;
  onClose: () => void;
  onReverted?: () => void;
}

/**
 * Reversión de un pago al proveedor con la confirmación común: nombra el pago, muestra el
 * efecto sobre la factura y la caja o el banco, exige motivo y bloquea un segundo envío.
 */
export function PayableReversalDialog({
  accountId,
  payment,
  invoiceNumber,
  onClose,
  onReverted,
}: Props) {
  const queryClient = useQueryClient();
  const where = payment.paymentMethod === 'TRANSFERENCIA' ? 'al banco' : 'a la caja';
  const reverseMutation = useMutation({
    mutationFn: (reason: string) => revertPayablePayment(accountId, payment.id, { reason }),
    onSuccess: () => {
      for (const key of [
        'payables',
        'payables-aging',
        'payables-statement',
        'treasury-documents',
      ]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      void queryClient.invalidateQueries({ queryKey: ['payable-detail', accountId] });
      void queryClient.invalidateQueries({ queryKey: ['payable-movements', accountId] });
      onReverted?.();
      onClose();
    },
  });

  const subject = [
    payment.documentNumber ? `Pago ${payment.documentNumber}` : 'Pago al proveedor',
    payment.amount ? formatMoney(payment.amount) : null,
    payment.date ?? null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ConfirmDialog
      open
      operationType="revert"
      title="¿Revertir el pago al proveedor?"
      subject={subject}
      effects={[
        invoiceNumber
          ? `La factura ${invoiceNumber} recupera el saldo pagado.`
          : 'La factura recupera el saldo pagado.',
        `El dinero del pago vuelve ${where}.`,
        'Se registra el asiento que reversa el pago.',
        'El pago queda marcado como revertido con su motivo; no se puede deshacer.',
      ]}
      reason={{ label: 'Motivo de la reversión', minLength: 3 }}
      confirmText="Revertir pago"
      onConfirm={(reason) => reverseMutation.mutateAsync(reason ?? '')}
      onCancel={onClose}
    />
  );
}
