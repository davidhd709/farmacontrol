import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmDialog } from '../src/components/ConfirmDialog';
import { AlertModalProvider, useAlertModal } from '../src/context/AlertModalContext';

describe('ConfirmDialog & SweetModal (REQ-011, REQ-012)', () => {
  it('renders with default titles and buttons according to operationType create', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        operationType="create"
        message="Está a punto de registrar el producto seleccionado."
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getByText('¿Confirmar registro?')).toBeInTheDocument();
    expect(screen.getByText('Está a punto de registrar el producto seleccionado.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirmar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('renders with update operationType defaults (Guardar Cambios)', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        operationType="update"
        message="Se actualizará la información del tercero seleccionado."
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText('¿Guardar cambios?')).toBeInTheDocument();
    expect(screen.getByText('Se actualizará la información del tercero seleccionado.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeInTheDocument();
  });

  it('renders with annul operationType defaults (Confirmar Anulación)', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        operationType="annul"
        message="La operación puede generar reversiones de caja, cartera y contabilidad."
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText('¿Anular este documento?')).toBeInTheDocument();
    expect(screen.getByText('La operación puede generar reversiones de caja, cartera y contabilidad.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirmar anulación/i })).toBeInTheDocument();
  });

  it('disables buttons and displays loading indicator when isLoading is true', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        operationType="create"
        isLoading={true}
        message="Guardando información..."
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    const confirmBtn = screen.getByRole('button', { name: /procesando/i });
    const cancelBtn = screen.getByRole('button', { name: /cancelar/i });

    expect(confirmBtn).toBeDisabled();
    expect(cancelBtn).toBeDisabled();

    fireEvent.click(confirmBtn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('allows keyboard interaction with Enter and Escape', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        operationType="confirm"
        title="¿Desea continuar?"
        message="Presione Enter para confirmar"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('AlertModalContext Hooks (REQ-011)', () => {
  const TestConsumer: React.FC<{
    onAction: (modal: ReturnType<typeof useAlertModal>) => void;
  }> = ({ onAction }) => {
    const modal = useAlertModal();
    return (
      <button onClick={() => onAction(modal)} data-testid="trigger-btn">
        Trigger
      </button>
    );
  };

  it('opens confirmation modal via confirmCreate hook and executes onConfirm', async () => {
    const executeAction = vi.fn().mockResolvedValue(undefined);

    render(
      <AlertModalProvider>
        <TestConsumer
          onAction={(modal) => {
            modal.confirmCreate({
              message: 'Confirmar nuevo registro',
              onConfirm: executeAction,
            });
          }}
        />
      </AlertModalProvider>,
    );

    fireEvent.click(screen.getByTestId('trigger-btn'));

    expect(await screen.findByText('¿Confirmar registro?')).toBeInTheDocument();
    expect(screen.getByText('Confirmar nuevo registro')).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /confirmar/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(executeAction).toHaveBeenCalledTimes(1);
    });
  });

  it('handles errors gracefully without unhandled crashes', async () => {
    const failingAction = vi.fn().mockRejectedValue(new Error('Saldo insuficiente en la cuenta.'));

    render(
      <AlertModalProvider>
        <TestConsumer
          onAction={(modal) => {
            modal.confirmAnnul({
              message: 'Anular recibo de caja',
              onConfirm: failingAction,
            });
          }}
        />
      </AlertModalProvider>,
    );

    fireEvent.click(screen.getByTestId('trigger-btn'));
    expect(await screen.findByText('¿Anular este documento?')).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /confirmar anulación/i });
    fireEvent.click(confirmBtn);

    expect(await screen.findByText('Saldo insuficiente en la cuenta.')).toBeInTheDocument();
    expect(screen.getByText('No fue posible realizar la operación')).toBeInTheDocument();
  });
});

