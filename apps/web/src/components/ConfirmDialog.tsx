import React, { useEffect, useId, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material';
import type { SweetModalType } from './SweetModal';

export type ConfirmOperationType =
  | 'create'
  | 'update'
  | 'delete'
  | 'deactivate'
  | 'annul'
  | 'revert'
  | 'close'
  | 'confirm'
  | 'custom';

/** Motivo que el flujo pide antes de confirmar (anulaciones, reversiones, cierres) */
export interface ConfirmReasonOptions {
  label?: string;
  /** Obligatorio por defecto: si el flujo lo pide, se exige */
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  helperText?: string;
}

export interface ConfirmDialogProps {
  open: boolean;
  operationType?: ConfirmOperationType;
  title?: string;
  /** Registro concreto sobre el que se actúa: «Recibo RC-000012 · $ 50.000» */
  subject?: React.ReactNode;
  description?: React.ReactNode;
  message?: React.ReactNode;
  /** Efectos concretos de confirmar, en el orden en que ocurren */
  effects?: React.ReactNode[];
  reason?: ConfirmReasonOptions;
  /** Texto del botón: debe nombrar la acción («Anular recibo», «Eliminar categoría») */
  confirmText?: string;
  cancelText?: string;
  confirmColor?: 'primary' | 'error' | 'warning' | 'info' | 'success';
  /** Se conserva por compatibilidad; el color sale del tipo de operación */
  modalType?: SweetModalType;
  isLoading?: boolean;
  /**
   * Ejecuta la operación. Si devuelve una promesa, el diálogo queda en espera y bloquea un
   * segundo envío; si la promesa falla, el error se muestra aquí y el diálogo sigue abierto.
   */
  onConfirm: (reason?: string) => void | Promise<unknown>;
  onClose?: () => void;
  onCancel?: () => void;
}

export const DEFAULT_TITLES: Record<ConfirmOperationType, string> = {
  create: '¿Confirmar registro?',
  update: '¿Guardar cambios?',
  delete: '¿Eliminar registro?',
  deactivate: '¿Inactivar registro?',
  annul: '¿Anular este documento?',
  revert: '¿Revertir operación?',
  close: '¿Cerrar el periodo?',
  confirm: '¿Confirmar operación?',
  custom: '¿Está seguro de continuar?',
};

export const DEFAULT_CONFIRM_TEXTS: Record<ConfirmOperationType, string> = {
  create: 'Confirmar',
  update: 'Guardar Cambios',
  delete: 'Eliminar',
  deactivate: 'Inactivar',
  annul: 'Confirmar Anulación',
  revert: 'Confirmar Reversión',
  close: 'Cerrar periodo',
  confirm: 'Confirmar',
  custom: 'Confirmar',
};

const DANGER: ConfirmOperationType[] = ['delete', 'annul', 'deactivate'];
const WARNING: ConfirmOperationType[] = ['revert', 'close'];

/**
 * Confirmación común de las operaciones que cambian datos (rediseño, fase 5). Nombra el
 * registro, enumera los efectos, pide motivo cuando el flujo lo exige y evita envíos
 * duplicados. Enter envía desde el formulario (nunca desde el motivo de varias líneas),
 * Escape cancela y, al cerrar, el foco vuelve al control que abrió el diálogo.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  operationType = 'custom',
  title,
  subject,
  description,
  message,
  effects,
  reason,
  confirmText,
  cancelText = 'Cancelar',
  confirmColor,
  isLoading = false,
  onConfirm,
  onClose,
  onCancel,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const [reasonText, setReasonText] = useState('');
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Un segundo clic llega antes de que React vuelva a pintar el botón deshabilitado
  const inFlight = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setReasonText('');
      setTouched(false);
      setError(null);
    }
  }, [open]);

  const busy = isLoading || pending;
  const isDanger = DANGER.includes(operationType) || confirmColor === 'error';
  const isWarning = WARNING.includes(operationType) || confirmColor === 'warning';
  const color = confirmColor ?? (isDanger ? 'error' : isWarning ? 'warning' : 'primary');
  const resolvedTitle = title || DEFAULT_TITLES[operationType];
  const resolvedConfirmText = confirmText || DEFAULT_CONFIRM_TEXTS[operationType];
  const content = description ?? message;

  const reasonRequired = reason ? reason.required !== false : false;
  const minLength = reason?.minLength ?? (reasonRequired ? 5 : 0);
  const trimmed = reasonText.trim();
  const reasonError =
    reason && reasonRequired && trimmed.length < minLength
      ? trimmed.length === 0
        ? 'Escribe el motivo.'
        : `El motivo debe tener al menos ${minLength} caracteres.`
      : null;

  const cancel = () => {
    if (busy) return;
    if (onCancel) onCancel();
    else onClose?.();
  };

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (busy || inFlight.current) return;
    if (reasonError) {
      setTouched(true);
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await onConfirm(reason ? trimmed : undefined);
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : 'No fue posible completar la operación. No se aplicó ningún cambio.',
      );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : cancel}
      maxWidth="sm"
      fullWidth
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      slotProps={{
        paper: { component: 'form', onSubmit: submit, noValidate: true } as never,
        // Al terminar la entrada se fija el foco inicial: en el navegador la trampa de foco del
        // diálogo puede tomarlo después de montar los botones
        transition: {
          onEntered: () =>
            (reason ? reasonRef : !isDanger ? confirmRef : cancelRef).current?.focus({
              preventScroll: true,
            }),
        },
      }}
    >
      <DialogTitle id={titleId} sx={{ fontWeight: 700 }}>
        {resolvedTitle}
      </DialogTitle>
      <DialogContent id={descriptionId} sx={{ display: 'grid', gap: 1.5 }}>
        {subject && (
          <Box
            data-testid="confirm-subject"
            sx={{ p: 1.5, borderRadius: 1, bgcolor: 'action.hover', fontWeight: 600 }}
          >
            {subject}
          </Box>
        )}
        {content &&
          (typeof content === 'string' ? (
            <Typography variant="body2" color="text.secondary">
              {content}
            </Typography>
          ) : (
            <Box sx={{ typography: 'body2', color: 'text.secondary' }}>{content}</Box>
          ))}
        {effects && effects.length > 0 && (
          <Box>
            <Typography variant="subtitle2" component="p" sx={{ fontWeight: 700, mb: 0.5 }}>
              Al confirmar:
            </Typography>
            <Box component="ul" data-testid="confirm-effects" sx={{ m: 0, pl: 2.5 }}>
              {effects.map((effect, index) => (
                <Typography component="li" variant="body2" key={index}>
                  {effect}
                </Typography>
              ))}
            </Box>
          </Box>
        )}
        {reason && (
          <TextField
            label={reason.label ?? 'Motivo'}
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            onBlur={() => setTouched(true)}
            required={reasonRequired}
            multiline
            minRows={2}
            autoFocus
            inputRef={reasonRef}
            disabled={busy}
            error={touched && Boolean(reasonError)}
            helperText={
              touched && reasonError
                ? reasonError
                : (reason.helperText ??
                  (reasonRequired ? `Mínimo ${minLength} caracteres; queda en el historial.` : ''))
            }
            slotProps={{ htmlInput: { maxLength: reason.maxLength ?? 300 } }}
          />
        )}
        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
        <Button
          ref={cancelRef}
          onClick={cancel}
          disabled={busy}
          data-action="cancel"
          // En una acción destructiva sin motivo el foco empieza en Cancelar
          autoFocus={!reason && isDanger}
        >
          {cancelText}
        </Button>
        <Button
          ref={confirmRef}
          type="submit"
          variant="contained"
          color={color}
          disabled={busy}
          autoFocus={!reason && !isDanger}
          startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
        >
          {busy ? 'Procesando…' : resolvedConfirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
