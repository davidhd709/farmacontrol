import React, { createContext, useContext, useState, useCallback } from 'react';
import { SweetModal, SweetModalType } from '../components/SweetModal';

export interface AlertModalOptions {
  type?: SweetModalType;
  title?: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  showCancelButton?: boolean;
  confirmColor?: 'primary' | 'error' | 'warning' | 'info' | 'success' | string;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
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
  });

  const closeAlert = useCallback(() => {
    setModalState((prev) => ({ ...prev, open: false }));
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

  const handleConfirm = async () => {
    if (modalState.onConfirmCallback) {
      await modalState.onConfirmCallback();
    }
    closeAlert();
  };

  const handleCancel = () => {
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
