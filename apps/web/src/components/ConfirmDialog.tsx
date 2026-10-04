import React from 'react';
import { SweetModal } from './SweetModal';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: 'primary' | 'error' | 'warning' | 'info' | 'success';
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose?: () => void;
  onCancel?: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  confirmColor = 'primary',
  isLoading = false,
  onConfirm,
  onClose,
  onCancel,
}) => {
  const modalType = confirmColor === 'error' ? 'warning' : 'question';

  return (
    <SweetModal
      open={open}
      type={modalType}
      title={title}
      description={description}
      confirmText={confirmText}
      cancelText={cancelText}
      showCancelButton={true}
      confirmColor={confirmColor}
      isLoading={isLoading}
      onConfirm={onConfirm}
      onClose={onClose}
      onCancel={onCancel}
    />
  );
};
