import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Chip,
  Stack,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import CloseIcon from '@mui/icons-material/Close';
import { useCompanyInfo } from '../../features/company/hooks/useCompanyInfo';
import { formatDateTime } from '../../utils/date-format';
import { printDocument, downloadDocumentPdf } from '../../utils/print-document';

export interface PrintableDocumentLayoutProps {
  open: boolean;
  onClose: () => void;
  documentType: string;
  documentNumber: string;
  documentDate: string | Date;
  status?: string;
  isCancelled?: boolean;
  cancelledAt?: string | null;
  cancelledByName?: string | null;
  cancellationReason?: string | null;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const PrintableDocumentLayout: React.FC<PrintableDocumentLayoutProps> = ({
  open,
  onClose,
  documentType,
  documentNumber,
  documentDate,
  status,
  isCancelled,
  cancelledAt,
  cancelledByName,
  cancellationReason,
  maxWidth = 'md',
  actions,
  children,
}) => {
  const company = useCompanyInfo();
  const cancelled = isCancelled || status === 'ANULADO' || status === 'CANCELLED';

  const fullDocTitle = `${documentNumber}_${documentType.replace(/\s+/g, '_')}`;

  const handlePrint = () => {
    printDocument(fullDocTitle);
  };

  const handleDownloadPdf = () => {
    downloadDocumentPdf(fullDocTitle);
  };

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={maxWidth}
      fullWidth
      slotProps={{
        paper: {
          className: 'print-document',
          sx: {
            borderRadius: 2.5,
            p: { xs: 1, sm: 2 },
            position: 'relative',
          },
        },
      }}
      aria-labelledby="printable-doc-title"
    >
      <DialogTitle
        className="no-print"
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pb: 1,
        }}
      >
        <Typography component="span" variant="h6" sx={{ fontWeight: 700 }}>
          {documentType} {documentNumber}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Chip
            label={cancelled ? 'ANULADO' : status || 'VIGENTE'}
            color={cancelled ? 'error' : 'success'}
            size="small"
            sx={{ fontWeight: 700 }}
          />
        </Stack>
      </DialogTitle>

      <DialogContent dividers sx={{ p: { xs: 2, sm: 3 } }}>
        {/* BANNER / MARCA VISIBLE SI ESTÁ ANULADO */}
        {cancelled && (
          <Box
            sx={{
              mb: 2.5,
              p: 1.5,
              border: '2px dashed #E05656',
              borderRadius: 2,
              bgcolor: 'rgba(224, 86, 86, 0.08)',
              textAlign: 'center',
            }}
          >
            <Typography variant="h6" color="error" sx={{ fontWeight: 900, letterSpacing: 1.5 }}>
              *** DOCUMENTO ANULADO ***
            </Typography>
            <Typography variant="body2" color="error" sx={{ mt: 0.5 }}>
              {cancelledAt ? `Fecha de anulación: ${formatDateTime(cancelledAt)}` : ''}
              {cancelledByName ? ` | Anulado por: ${cancelledByName}` : ''}
            </Typography>
            {cancellationReason && (
              <Typography variant="caption" component="div" color="text.secondary" sx={{ mt: 0.5 }}>
                Motivo: {cancellationReason}
              </Typography>
            )}
          </Box>
        )}

        {/* ENCABEZADO INSTITUCIONAL DE LA EMPRESA */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', sm: 'center' },
            pb: 2,
            borderBottom: '2px solid #E0E0E0',
          }}
        >
          <Box sx={{ mb: { xs: 1.5, sm: 0 } }}>
            <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.main', lineHeight: 1.2 }}>
              {company.legalName}
            </Typography>
            {company.tradeName && company.tradeName !== company.legalName && (
              <Typography variant="subtitle2" color="text.secondary">
                {company.tradeName}
              </Typography>
            )}
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              {company.taxIdFull}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div">
              {company.address} {company.phone ? `• Tel: ${company.phone}` : ''}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div">
              {company.email}
            </Typography>
          </Box>

          <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 1 }}>
              {documentType.toUpperCase()}
            </Typography>
            <Typography id="printable-doc-title" variant="h5" sx={{ fontWeight: 800, color: '#333333' }}>
              {documentNumber}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Fecha: {formatDateTime(documentDate)}
            </Typography>
          </Box>
        </Box>

        {/* CUERPO DEL DOCUMENTO */}
        <Box sx={{ mt: 2 }}>{children}</Box>
      </DialogContent>

      {/* BARRA DE ACCIONES (NO IMPRESA) */}
      <DialogActions
        className="no-print"
        sx={{
          p: 2,
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<PrintIcon />}
            onClick={handlePrint}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Imprimir
          </Button>
          <Button
            variant="outlined"
            color="primary"
            startIcon={<PictureAsPdfIcon />}
            onClick={handleDownloadPdf}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Descargar PDF
          </Button>
        </Stack>

        <Stack direction="row" spacing={1}>
          {actions}
          <Button
            variant="outlined"
            color="inherit"
            startIcon={<CloseIcon />}
            onClick={onClose}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            Cerrar
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
};
