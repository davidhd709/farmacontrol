import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BarcodeScanField } from '../src/components/BarcodeScanField';
import { appTheme } from '../src/theme/app-theme';

const mount = (onScan: (code: string) => Promise<string | null>) =>
  render(
    <ThemeProvider theme={appTheme}>
      <BarcodeScanField onScan={onScan} />
    </ThemeProvider>,
  );

describe('Campo de la pistola lectora', () => {
  it('tiene foco automático y con Enter entrega el código, limpia y vuelve a enfocar', async () => {
    const onScan = vi.fn().mockResolvedValue(null);
    mount(onScan);
    const input = screen.getByLabelText('Escanear código de barras');
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: ' 7702001000017 ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onScan).toHaveBeenCalledWith('7702001000017');
    expect(input).toHaveValue('');
    await waitFor(() => expect(input).toHaveFocus());
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('un código inexistente muestra un aviso no bloqueante y permite el siguiente escaneo', async () => {
    const onScan = vi
      .fn()
      .mockResolvedValueOnce('El código "999" no existe en el catálogo.')
      .mockResolvedValueOnce(null);
    mount(onScan);
    const input = screen.getByLabelText('Escanear código de barras');
    fireEvent.change(input, { target: { value: '999' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByText('El código "999" no existe en el catálogo.')).toBeInTheDocument();
    expect(input).toBeEnabled();
    fireEvent.change(input, { target: { value: '7702001000017' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(screen.queryByText(/no existe en el catálogo/)).not.toBeInTheDocument());
    expect(onScan).toHaveBeenCalledTimes(2);
  });
});
