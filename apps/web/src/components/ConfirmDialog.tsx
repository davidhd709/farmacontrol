import React from 'react';
import { SweetModal, SweetModalType } from './SweetModal';

export type ConfirmOperationType =
  | 'create'
  | 'update'
  | 'delete'
  | 'annul'
  | 'revert'
  | 'confirm'
  | 'custom';

export interface ConfirmDialogProps {
  open: boolean;
  operationType?: ConfirmOperationType;
  title?: string;
  description?: React.ReactNode;
  message?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: 'primary' | 'error' | 'warning' | 'info' | 'success';
  modalType?: SweetModalType;
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose?: () => void;
  onCancel?: () => void;
}

const DEFAULT_TITLES: Record<ConfirmOperationType, string> = {
  create: '¿Confirmar registro?',
  update: '¿Guardar cambios?',
  delete: '¿Eliminar registro?',
  annul: '¿Anular este documento?',
  revert: '¿Revertir operación?',
  confirm: '¿Confirmar operación?',
  custom: '¿Está seguro de continuar?',
};

const DEFAULT_CONFIRM_TEXTS: Record<ConfirmOperationType, string> = {
  create: 'Confirmar',
  update: 'Guardar Cambios',
  delete: 'Eliminar',
  annul: 'Confirmar Anulación',
  revert: 'Confirmar Reversión',
  confirm: 'Confirmar',
  custom: 'Confirmar',
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  operationType = 'custom',
  title,
  description,
  message,
  confirmText,
  cancelText = 'Cancelar',
  confirmColor,
  modalType,
  isLoading = false,
  onConfirm,
  onClose,
  onCancel,
}) => {
  const resolvedTitle = title || DEFAULT_TITLES[operationType] || '¿Confirmar acción?';
  const resolvedConfirmText = confirmText || DEFAULT_CONFIRM_TEXTS[operationType] || 'Confirmar';

  const isDanger = operationType === 'delete' || operationType === 'annul' || confirmColor === 'error';
  const isWarning = operationType === 'revert' || confirmColor === 'warning';

  const resolvedColor =
    confirmColor || (isDanger ? 'error' : isWarning ? 'warning' : 'primary');

  const resolvedType =
    modalType || (isDanger ? 'warning' : isWarning ? 'warning' : 'question');

  return (
    <SweetModal
      open={open}
      type={resolvedType}
      title={resolvedTitle}
      description={description ?? message}
      confirmText={resolvedConfirmText}
      cancelText={cancelText}
      showCancelButton={true}
      confirmColor={resolvedColor}
      isLoading={isLoading}
      onConfirm={onConfirm}
      onClose={onClose}
      onCancel={onCancel}
    />
  );
};
