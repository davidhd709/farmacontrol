import React from 'react';
import {
  Dialog,
  DialogContent,
  Typography,
  Button,
  Box,
  Stack,
  CircularProgress,
} from '@mui/material';

export type SweetModalType = 'success' | 'warning' | 'error' | 'info' | 'question';

export interface SweetModalProps {
  open: boolean;
  type?: SweetModalType;
  title: string;
  description?: React.ReactNode;
  text?: React.ReactNode;
  message?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  showCancelButton?: boolean;
  confirmColor?: 'primary' | 'error' | 'warning' | 'info' | 'success' | string;
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose?: () => void;
  onCancel?: () => void;
}

const renderIcon = (type: SweetModalType) => {
  switch (type) {
    case 'success':
      return (
        <Box
          sx={{
            width: 84,
            height: 84,
            borderRadius: '50%',
            border: '4px solid #A5DC86',
            mx: 'auto',
            mt: 2,
            mb: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(165, 220, 134, 0.08)',
            animation: 'sweetBounce 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            '@keyframes sweetBounce': {
              '0%': { transform: 'scale(0.3)', opacity: 0 },
              '60%': { transform: 'scale(1.1)' },
              '100%': { transform: 'scale(1)', opacity: 1 },
            },
          }}
        >
          <svg width="46" height="46" viewBox="0 0 48 48">
            <path
              d="M13 25 L21 33 L35 17"
              fill="none"
              stroke="#A5DC86"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Box>
      );
    case 'warning':
    case 'question':
      return (
        <Box
          sx={{
            width: 84,
            height: 84,
            borderRadius: '50%',
            border: `4px solid ${type === 'warning' ? '#F8BB86' : '#87ADBD'}`,
            mx: 'auto',
            mt: 2,
            mb: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor:
              type === 'warning' ? 'rgba(248, 187, 134, 0.08)' : 'rgba(135, 173, 189, 0.08)',
            animation: 'sweetBounce 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          }}
        >
          <Typography
            sx={{
              fontSize: '2.8rem',
              fontWeight: 700,
              color: type === 'warning' ? '#F8BB86' : '#87ADBD',
              lineHeight: 1,
            }}
          >
            {type === 'warning' ? '!' : '?'}
          </Typography>
        </Box>
      );
    case 'error':
      return (
        <Box
          sx={{
            width: 84,
            height: 84,
            borderRadius: '50%',
            border: '4px solid #F27474',
            mx: 'auto',
            mt: 2,
            mb: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(242, 116, 116, 0.08)',
            animation: 'sweetBounce 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          }}
        >
          <svg width="40" height="40" viewBox="0 0 40 40">
            <path
              d="M12 12 L28 28 M28 12 L12 28"
              fill="none"
              stroke="#F27474"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
        </Box>
      );
    case 'info':
    default:
      return (
        <Box
          sx={{
            width: 84,
            height: 84,
            borderRadius: '50%',
            border: '4px solid #87ADBD',
            mx: 'auto',
            mt: 2,
            mb: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(135, 173, 189, 0.08)',
            animation: 'sweetBounce 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          }}
        >
          <Typography
            sx={{
              fontSize: '2.8rem',
              fontWeight: 700,
              color: '#87ADBD',
              lineHeight: 1,
            }}
          >
            i
          </Typography>
        </Box>
      );
  }
};

export const SweetModal: React.FC<SweetModalProps> = ({
  open,
  type = 'success',
  title,
  description,
  text,
  message,
  confirmText = 'OK',
  cancelText = 'Cancelar',
  showCancelButton = false,
  confirmColor,
  isLoading = false,
  onConfirm,
  onClose,
  onCancel,
}) => {
  const content = description ?? text ?? message;

  const handleCancel = () => {
    if (isLoading) return;
    if (onCancel) onCancel();
    else if (onClose) onClose();
  };

  const handleConfirm = () => {
    if (isLoading) return;
    void onConfirm();
  };

  // Teclado (rediseño, fase 5): el botón principal recibe el foco, así que Enter lo activa de
  // forma nativa; Escape lo maneja el Dialog. Antes un listener global confirmaba con Enter
  // aunque el foco estuviera en otro control.

  // Colores del tema: todos cumplen contraste AA con texto blanco
  const paletteKey =
    confirmColor === 'error' ||
    confirmColor === 'warning' ||
    confirmColor === 'success' ||
    confirmColor === 'info'
      ? confirmColor
      : 'primary';
  const customColor =
    typeof confirmColor === 'string' && confirmColor.startsWith('#') ? confirmColor : null;

  return (
    <Dialog
      open={open}
      onClose={isLoading ? undefined : handleCancel}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 4,
            p: { xs: 2.5, sm: 3.5 },
            textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
            backgroundColor: '#ffffff',
          },
        },
      }}
      aria-labelledby="sweet-modal-title"
      aria-modal="true"
      role="alertdialog"
    >
      <DialogContent sx={{ p: 0 }}>
        {/* Icono animado centrado */}
        {renderIcon(type)}

        {/* Título principal centrado */}
        <Typography
          id="sweet-modal-title"
          variant="h5"
          component="h2"
          sx={{
            fontWeight: 700,
            color: 'text.primary',
            textAlign: 'center',
            mb: 1.5,
            fontSize: { xs: '1.5rem', sm: '1.75rem' },
          }}
        >
          {title}
        </Typography>

        {/* Descripción centrada */}
        {content && (
          <Box sx={{ mb: 3.5, px: 1 }}>
            {typeof content === 'string' ? (
              <Typography
                variant="body1"
                sx={{
                  color: 'text.secondary',
                  textAlign: 'center',
                  fontSize: '1.05rem',
                  lineHeight: 1.5,
                }}
              >
                {content}
              </Typography>
            ) : (
              content
            )}
          </Box>
        )}

        {/* Acciones centradas */}
        <Stack
          direction="row"
          spacing={2}
          sx={{
            justifyContent: 'center',
            alignItems: 'center',
            mt: content ? 0 : 2,
          }}
        >
          {showCancelButton && (
            <Button
              onClick={handleCancel}
              disabled={isLoading}
              variant="contained"
              data-action="cancel"
              sx={{
                bgcolor: 'grey.700',
                color: '#ffffff',
                fontSize: '0.95rem',
                fontWeight: 600,
                px: 3.5,
                py: 1,
                borderRadius: 2,
                textTransform: 'none',
                boxShadow: 'none',
                '&:hover': {
                  bgcolor: 'grey.800',
                  boxShadow: 'none',
                },
              }}
            >
              {cancelText}
            </Button>
          )}

          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            variant="contained"
            color={paletteKey}
            data-action="confirm"
            autoFocus
            startIcon={isLoading ? <CircularProgress size={18} color="inherit" /> : null}
            sx={{
              ...(customColor ? { bgcolor: customColor } : {}),
              fontSize: '1rem',
              fontWeight: 600,
              px: showCancelButton ? 3.5 : 4.5,
              py: 1.1,
              borderRadius: 2,
              textTransform: 'none',
              boxShadow: 'none',
              minWidth: 100,
            }}
          >
            {isLoading ? 'Procesando…' : confirmText}
          </Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
};
