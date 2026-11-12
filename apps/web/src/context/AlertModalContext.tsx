import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { SweetModal, SweetModalType } from '../components/SweetModal';
import type { ConfirmOperationType } from '../components/ConfirmDialog';

export interface AlertModalOptions {
  type?: SweetModalType;
  title?: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  showCancelButton?: boolean;
  confirmColor?: 'primary' | 'error' | 'warning' | 'info' | 'success' | string;
  isLoading?: boolean;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
}

export interface ConfirmActionOptions {
  operationType?: ConfirmOperationType;
  title?: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
  successMessage?: React.ReactNode;
  successTitle?: string;
}

export interface AlertModalContextValue {
  showAlert: (options: AlertModalOptions) => void;
  alertSuccess: (message: React.ReactNode, title?: string, onOk?: () => void) => void;
  alertError: (message: React.ReactNode, title?: string, onOk?: () => void) => void;
  alertWarning: (message: React.ReactNode, title?: string, onOk?: () => void) => void;
  alertInfo: (message: React.ReactNode, title?: string, onOk?: () => void) => void;
  alertConfirm: (options: {
    title: string;
    message: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
    onConfirm: () => void | Promise<void>;
    onCancel?: () => void;
  }) => void;
  confirmAction: (options: ConfirmActionOptions) => void;
  confirmCreate: (options: {
    title?: string;
    message: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void | Promise<void>;
    onCancel?: () => void;
    successMessage?: React.ReactNode;
  }) => void;
  confirmUpdate: (options: {
    title?: string;
    message: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void | Promise<void>;
    onCancel?: () => void;
    successMessage?: React.ReactNode;
  }) => void;
  confirmAnnul: (options: {
    title?: string;
    message: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void | Promise<void>;
    onCancel?: () => void;
    successMessage?: React.ReactNode;
  }) => void;
  confirmDelete: (options: {
    title?: string;
    message: React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void | Promise<void>;
    onCancel?: () => void;
    successMessage?: React.ReactNode;
  }) => void;
  closeAlert: () => void;
}

const AlertModalContext = createContext<AlertModalContextValue | undefined>(undefined);

// Objeto singleton para invocación fuera del ciclo de render de React si es necesario
type AlertCallback = (options: AlertModalOptions) => void;
let globalShowAlert: AlertCallback | null = null;

export const notifyEvent = {
  success: (message: React.ReactNode, title = '¡Operación Exitosa!') => {
    if (globalShowAlert) {
      globalShowAlert({ type: 'success', title, message });
    }
  },
  error: (message: React.ReactNode, title = 'Error') => {
    if (globalShowAlert) {
      globalShowAlert({ type: 'error', title, message, confirmColor: 'error' });
    }
  },
  warning: (message: React.ReactNode, title = 'Atención') => {
    if (globalShowAlert) {
      globalShowAlert({ type: 'warning', title, message, confirmColor: 'warning' });
    }
  },
};

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

export const AlertModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [modalState, setModalState] = useState<{
    open: boolean;
    type: SweetModalType;
    title: string;
    description: React.ReactNode;
    confirmText: string;
    cancelText: string;
    showCancelButton: boolean;
    confirmColor?: 'primary' | 'error' | 'warning' | 'info' | 'success' | string;
    isLoading?: boolean;
    onConfirmCallback?: () => void | Promise<void>;
    onCancelCallback?: () => void;
  }>({
    open: false,
    type: 'success',
    title: '',
    description: '',
    confirmText: 'OK',
    cancelText: 'Cancelar',
    showCancelButton: false,
    isLoading: false,
  });

  const isExecutingRef = useRef(false);

  const closeAlert = useCallback(() => {
    setModalState((prev) => ({ ...prev, open: false, isLoading: false }));
    isExecutingRef.current = false;
  }, []);

  const showAlert = useCallback((options: AlertModalOptions) => {
    setModalState({
      open: true,
      type: options.type || 'success',
      title: options.title || (options.type === 'error' ? 'Error' : '¡Operación Exitosa!'),
      description: options.message,
      confirmText: options.confirmText || 'OK',
      cancelText: options.cancelText || 'Cancelar',
      showCancelButton: options.showCancelButton || false,
      confirmColor: options.confirmColor,
      isLoading: options.isLoading || false,
      onConfirmCallback: options.onConfirm,
      onCancelCallback: options.onCancel,
    });
  }, []);

  // Registrar callback global
  React.useEffect(() => {
    globalShowAlert = showAlert;
    return () => {
      globalShowAlert = null;
    };
  }, [showAlert]);

  const alertSuccess = useCallback(
    (message: React.ReactNode, title = '¡Buen trabajo!', onOk?: () => void) => {
      showAlert({
        type: 'success',
        title,
        message,
        confirmText: 'OK',
        onConfirm: onOk,
      });
    },
    [showAlert],
  );

  const alertError = useCallback(
    (message: React.ReactNode, title = 'Error', onOk?: () => void) => {
      showAlert({
        type: 'error',
        title,
        message,
        confirmText: 'Aceptar',
        confirmColor: 'error',
        onConfirm: onOk,
      });
    },
    [showAlert],
  );

  const alertWarning = useCallback(
    (message: React.ReactNode, title = 'Advertencia', onOk?: () => void) => {
      showAlert({
        type: 'warning',
        title,
        message,
        confirmText: 'Entendido',
        confirmColor: 'warning',
        onConfirm: onOk,
      });
    },
    [showAlert],
  );

  const alertInfo = useCallback(
    (message: React.ReactNode, title = 'Información', onOk?: () => void) => {
      showAlert({
        type: 'info',
        title,
        message,
        confirmText: 'OK',
        onConfirm: onOk,
      });
    },
    [showAlert],
  );

  const alertConfirm = useCallback(
    (options: {
      title: string;
      message: React.ReactNode;
      confirmText?: string;
      cancelText?: string;
      isDanger?: boolean;
      onConfirm: () => void | Promise<void>;
      onCancel?: () => void;
    }) => {
      showAlert({
        type: options.isDanger ? 'warning' : 'question',
        title: options.title,
        message: options.message,
        confirmText: options.confirmText || 'Sí, confirmar',
        cancelText: options.cancelText || 'Cancelar',
        showCancelButton: true,
        confirmColor: options.isDanger ? 'error' : 'primary',
        onConfirm: options.onConfirm,
        onCancel: options.onCancel,
      });
    },
    [showAlert],
  );

  const confirmAction = useCallback(
    (options: ConfirmActionOptions) => {
      const op = options.operationType || 'custom';
      const resolvedTitle = options.title || DEFAULT_TITLES[op] || '¿Confirmar acción?';
      const resolvedConfirmText =
        options.confirmText || DEFAULT_CONFIRM_TEXTS[op] || 'Confirmar';

      const isDanger =
        options.isDanger || op === 'delete' || op === 'annul';
      const isWarning = op === 'revert';

      showAlert({
        type: isDanger ? 'warning' : isWarning ? 'warning' : 'question',
        title: resolvedTitle,
        message: options.message,
        confirmText: resolvedConfirmText,
        cancelText: options.cancelText || 'Cancelar',
        showCancelButton: true,
        confirmColor: isDanger ? 'error' : isWarning ? 'warning' : 'primary',
        onConfirm: async () => {
          if (options.onConfirm) {
            await options.onConfirm();
          }
          if (options.successMessage) {
            alertSuccess(options.successMessage, options.successTitle || '¡Operación Exitosa!');
          }
        },
        onCancel: options.onCancel,
      });
    },
    [showAlert, alertSuccess],
  );

  const confirmCreate = useCallback(
    (options: {
      title?: string;
      message: React.ReactNode;
      confirmText?: string;
      cancelText?: string;
      onConfirm: () => void | Promise<void>;
      onCancel?: () => void;
      successMessage?: React.ReactNode;
    }) => {
      confirmAction({
        operationType: 'create',
        title: options.title,
        message: options.message,
        confirmText: options.confirmText,
        cancelText: options.cancelText,
        onConfirm: options.onConfirm,
        onCancel: options.onCancel,
        successMessage: options.successMessage || 'Registro creado correctamente.',
      });
    },
    [confirmAction],
  );

  const confirmUpdate = useCallback(
    (options: {
      title?: string;
      message: React.ReactNode;
      confirmText?: string;
      cancelText?: string;
      onConfirm: () => void | Promise<void>;
      onCancel?: () => void;
      successMessage?: React.ReactNode;
    }) => {
      confirmAction({
        operationType: 'update',
        title: options.title,
        message: options.message,
        confirmText: options.confirmText,
        cancelText: options.cancelText,
        onConfirm: options.onConfirm,
        onCancel: options.onCancel,
        successMessage: options.successMessage || 'Cambios guardados.',
      });
    },
    [confirmAction],
  );

  const confirmAnnul = useCallback(
    (options: {
      title?: string;
      message: React.ReactNode;
      confirmText?: string;
      cancelText?: string;
      onConfirm: () => void | Promise<void>;
      onCancel?: () => void;
      successMessage?: React.ReactNode;
    }) => {
      confirmAction({
        operationType: 'annul',
        title: options.title,
        message: options.message,
        confirmText: options.confirmText,
        cancelText: options.cancelText,
        isDanger: true,
        onConfirm: options.onConfirm,
        onCancel: options.onCancel,
        successMessage: options.successMessage || 'Documento anulado.',
      });
    },
    [confirmAction],
  );

  const confirmDelete = useCallback(
    (options: {
      title?: string;
      message: React.ReactNode;
      confirmText?: string;
      cancelText?: string;
      onConfirm: () => void | Promise<void>;
      onCancel?: () => void;
      successMessage?: React.ReactNode;
    }) => {
      confirmAction({
        operationType: 'delete',
        title: options.title,
        message: options.message,
        confirmText: options.confirmText,
        cancelText: options.cancelText,
        isDanger: true,
        onConfirm: options.onConfirm,
        onCancel: options.onCancel,
        successMessage: options.successMessage || 'Registro eliminado correctamente.',
      });
    },
    [confirmAction],
  );

  const handleConfirm = async () => {
    if (isExecutingRef.current) return;
    isExecutingRef.current = true;
    setModalState((prev) => ({ ...prev, isLoading: true }));

    try {
      if (modalState.onConfirmCallback) {
        await modalState.onConfirmCallback();
      }
      closeAlert();
    } catch (err: unknown) {
      setModalState((prev) => ({ ...prev, isLoading: false }));
      isExecutingRef.current = false;
      const msg = err instanceof Error ? err.message : 'No fue posible realizar la operación.';
      alertError(msg, 'No fue posible realizar la operación');
    }
  };

  const handleCancel = () => {
    if (modalState.isLoading) return;
    if (modalState.onCancelCallback) {
      modalState.onCancelCallback();
    }
    closeAlert();
  };

  return (
    <AlertModalContext.Provider
      value={{
        showAlert,
        alertSuccess,
        alertError,
        alertWarning,
        alertInfo,
        alertConfirm,
        confirmAction,
        confirmCreate,
        confirmUpdate,
        confirmAnnul,
        confirmDelete,
        closeAlert,
      }}
    >
      {children}

      <SweetModal
        open={modalState.open}
        type={modalState.type}
        title={modalState.title}
        description={modalState.description}
        confirmText={modalState.confirmText}
        cancelText={modalState.cancelText}
        showCancelButton={modalState.showCancelButton}
        confirmColor={modalState.confirmColor}
        isLoading={modalState.isLoading}
        onConfirm={handleConfirm}
        onClose={handleCancel}
        onCancel={handleCancel}
      />
    </AlertModalContext.Provider>
  );
};

export const useAlertModal = (): AlertModalContextValue => {
  const context = useContext(AlertModalContext);
  if (!context) {
    throw new Error('useAlertModal debe ser utilizado dentro de un AlertModalProvider');
  }
  return context;
};
