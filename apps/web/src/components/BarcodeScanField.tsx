import { useRef, useState } from 'react';
import { Alert, Box, InputAdornment, TextField } from '@mui/material';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';

/**
 * Campo para la pistola lectora, que escribe el código como un teclado y envía Enter. Tiene
 * foco automático; con Enter entrega el código, limpia el campo y vuelve a enfocarlo para el
 * siguiente escaneo. Un código inexistente muestra un aviso que no bloquea la pantalla.
 */
export function BarcodeScanField({
  onScan,
  label = 'Escanear código de barras',
  autoFocus = true,
}: {
  /** Devuelve el aviso a mostrar (p. ej. código inexistente) o null si se agregó */
  onScan: (code: string) => Promise<string | null>;
  label?: string;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const code = value.trim();
    setValue('');
    inputRef.current?.focus();
    if (!code || busy) return;
    setBusy(true);
    try {
      setWarning(await onScan(code));
    } catch (error) {
      setWarning(error instanceof Error ? error.message : 'No se pudo buscar el código.');
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <Box>
      <TextField
        inputRef={inputRef}
        label={label}
        size="small"
        fullWidth
        autoFocus={autoFocus}
        autoComplete="off"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void submit();
          }
        }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <QrCodeScannerIcon fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
        helperText="Apunta la pistola a este campo: cada lectura agrega el producto."
      />
      {warning && (
        <Alert severity="warning" sx={{ mt: 1 }} onClose={() => setWarning(null)} role="status">
          {warning}
        </Alert>
      )}
    </Box>
  );
}
