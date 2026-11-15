import type { ExpenseDto, ExpensePaymentDto } from '@farmacia/contracts';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { formatMoney } from '../../../components/DocumentMovementsTable';
import type { ExpenseReasonFormData } from '../validation/expense-reason.schema';

interface Props {
  kind: 'cancel' | 'reverse';
  /** Gasto que se anula o al que pertenece el pago */
  expense?: ExpenseDto | null;
  /** Pago que se revierte */
  payment?: ExpensePaymentDto | null;
  onClose: () => void;
  onSubmit: (data: ExpenseReasonFormData) => Promise<void>;
}

const expenseLabel = (expense?: ExpenseDto | null) =>
  expense ? (expense.documentNumber ? `Gasto ${expense.documentNumber}` : 'Gasto') : 'Gasto';

/**
 * Anulación de un gasto o reversión de uno de sus pagos con la confirmación común: nombra el
 * registro, muestra sus efectos y exige el motivo (mínimo 5 caracteres, como el servidor).
 */
export function ExpenseReasonDialog({ kind, expense, payment, onClose, onSubmit }: Props) {
  const cancel = kind === 'cancel';
  const activePaid = expense?.payments.some((p) => !p.isReversed) ?? false;

  const subject = cancel
    ? expense
      ? [
          expenseLabel(expense),
          expense.description,
          expense.supplierName ?? expense.beneficiary,
          formatMoney(expense.amount),
        ]
          .filter(Boolean)
          .join(' · ')
      : null
    : payment
      ? [
          `Pago del ${payment.paymentDate.slice(0, 10)}`,
          formatMoney(payment.amount),
          payment.paymentMethod === 'TRANSFERENCIA'
            ? (payment.bankAccountName ?? 'Transferencia')
            : 'Efectivo',
          expense ? `${expenseLabel(expense)} · ${expense.description}` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : null;

  const effects = cancel
    ? [
        'Se registra el asiento contable que reversa la causación.',
        activePaid
          ? 'Los pagos de contado vuelven a la caja o al banco de donde salieron.'
          : 'La cuenta por pagar del gasto queda sin saldo.',
        'El gasto queda anulado con su motivo; no se puede deshacer.',
      ]
    : [
        'El gasto recupera el saldo pendiente del pago.',
        payment?.paymentMethod === 'TRANSFERENCIA'
          ? 'El dinero vuelve a la cuenta bancaria del pago.'
          : 'El dinero vuelve a la caja.',
        'Se registra el asiento que reversa el pago.',
        'El pago queda marcado como revertido con su motivo; no se puede deshacer.',
      ];

  return (
    <ConfirmDialog
      open
      operationType={cancel ? 'annul' : 'revert'}
      title={cancel ? '¿Anular el gasto?' : '¿Revertir el pago del gasto?'}
      subject={subject}
      effects={effects}
      reason={{
        label: cancel ? 'Motivo de la anulación' : 'Motivo de la reversión',
        minLength: 5,
      }}
      confirmText={cancel ? 'Anular gasto' : 'Revertir pago'}
      onConfirm={(reason) => onSubmit({ reason: reason ?? '' })}
      onCancel={onClose}
    />
  );
}
