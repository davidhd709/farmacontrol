import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '../src/components/ConfirmDialog';

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
    expect(
      screen.getByText('Está a punto de registrar el producto seleccionado.'),
    ).toBeInTheDocument();
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
    expect(
      screen.getByText('Se actualizará la información del tercero seleccionado.'),
    ).toBeInTheDocument();
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
    expect(
      screen.getByText('La operación puede generar reversiones de caja, cartera y contabilidad.'),
    ).toBeInTheDocument();
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

  it('Escape cancela y Enter envía desde el formulario del diálogo', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();

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

    // El botón principal recibe el foco: Enter lo activa
    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('nombra el registro y enumera los efectos; en una acción destructiva el foco empieza en Cancelar', () => {
    render(
      <ConfirmDialog
        open={true}
        operationType="delete"
        title="¿Eliminar la categoría?"
        subject="Categoría «Analgésicos»"
        effects={['Deja de aparecer al crear productos.', 'Los productos existentes no cambian.']}
        confirmText="Eliminar categoría"
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: '¿Eliminar la categoría?' })).toBeInTheDocument();
    expect(screen.getByTestId('confirm-subject')).toHaveTextContent('Categoría «Analgésicos»');
    const effects = screen.getByTestId('confirm-effects');
    expect(effects.querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Eliminar categoría' })).toBeInTheDocument();
  });

  it('exige el motivo, lo entrega recortado y Enter en el motivo no envía', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        open={true}
        operationType="annul"
        title="¿Anular el recibo RC-000012?"
        reason={{ label: 'Motivo de la anulación' }}
        confirmText="Anular recibo"
        onConfirm={onConfirm}
      />,
    );

    const field = screen.getByRole('textbox', { name: /Motivo de la anulación/ });
    expect(field).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Anular recibo' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('Escribe el motivo.')).toBeInTheDocument();

    await user.type(field, '  Valor mal{Enter}digitado  ');
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Anular recibo' }));
    expect(onConfirm).toHaveBeenCalledWith('Valor mal\ndigitado');
  });

  it('un doble clic ejecuta la operación una sola vez', async () => {
    let resolve: () => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    render(
      <ConfirmDialog
        open={true}
        operationType="create"
        confirmText="Registrar compra"
        onConfirm={onConfirm}
      />,
    );

    const button = screen.getByRole('button', { name: 'Registrar compra' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: /Procesando/ })).toBeDisabled();
    resolve();
    expect(await screen.findByRole('button', { name: 'Registrar compra' })).toBeEnabled();
  });

  it('si la operación falla muestra el error y sigue abierto para reintentar o cancelar', async () => {
    const onConfirm = vi
      .fn()
      .mockRejectedValueOnce(new Error('El periodo 2026-10 está cerrado.'))
      .mockResolvedValueOnce(undefined);
    render(
      <ConfirmDialog
        open={true}
        operationType="annul"
        confirmText="Anular asiento"
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Anular asiento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El periodo 2026-10 está cerrado.');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Anular asiento' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
  });
});
