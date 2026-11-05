import { useState, type FormEvent } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { changeOwnPassword } from '../password.api';
import { validateNewPassword } from '../password-policy';

interface ChangePasswordDialogProps {
  open: boolean;
  onClose: () => void;
  /** Cambio obligatorio de una contraseña temporal: no se puede cerrar ni cancelar. */
  required?: boolean;
  /** Cuenta con la sesión iniciada, para que el usuario confirme quién es. */
  username?: string;
  /** En el cambio obligatorio, única salida alternativa a guardar la contraseña. */
  onLogout?: () => void;
  isLoggingOut?: boolean;
}

export function ChangePasswordDialog({
  open,
  onClose,
  required = false,
  username,
  onLogout,
  isLoggingOut = false,
}: ChangePasswordDialogProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const close = () => {
    if (pending || required) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmation('');
    setError(null);
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentPassword) {
      setError('Ingresa tu contraseña actual.');
      return;
    }
    const validationError = validateNewPassword(newPassword);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (newPassword !== confirmation) {
      setError('La confirmación no coincide con la nueva contraseña.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await changeOwnPassword(currentPassword, newPassword);
      // La API revoca todas las sesiones; recargar elimina también los datos en memoria.
      window.location.replace('/login');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible cambiar la contraseña.');
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      maxWidth="xs"
      fullWidth
      aria-labelledby="change-password-title"
    >
      <form onSubmit={submit}>
        <DialogTitle id="change-password-title">
          {required ? 'Cambia tu contraseña temporal' : 'Cambiar mi contraseña'}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {required && (
              <Alert severity="warning">
                Un administrador asignó la contraseña de{' '}
                {username ? <strong>{username}</strong> : 'tu cuenta'}. Para continuar debes elegir
                una contraseña personal que solo tú conozcas.
              </Alert>
            )}
            <Typography variant="body2" color="text.secondary">
              Al guardar se cerrarán tus sesiones. Inicia sesión de nuevo con la contraseña nueva.
            </Typography>
            {error && (
              <Alert severity="error" role="alert">
                {error}
              </Alert>
            )}
            <TextField
              label={required ? 'Contraseña temporal' : 'Contraseña actual'}
              type="password"
              autoComplete="current-password"
              required
              fullWidth
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              disabled={pending}
            />
            <TextField
              label="Nueva contraseña"
              type="password"
              autoComplete="new-password"
              required
              fullWidth
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              helperText="Entre 10 y 128 caracteres; mayúscula, minúscula, número y carácter especial."
              disabled={pending}
            />
            <TextField
              label="Confirmar nueva contraseña"
              type="password"
              autoComplete="new-password"
              required
              fullWidth
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={pending}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          {required ? (
            <Button onClick={onLogout} disabled={pending || isLoggingOut || !onLogout}>
              Cerrar sesión
            </Button>
          ) : (
            <Button onClick={close} disabled={pending}>
              Cancelar
            </Button>
          )}
          <Button type="submit" variant="contained" disabled={pending}>
            Guardar contraseña
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
