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
  createdByName?: string | null;
  showSignatures?: boolean;
  recipientLabel?: string;
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
  createdByName,
  showSignatures = true,
  recipientLabel = 'Firma y Cédula Beneficiario / Recibí Conforme',
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
          className: 'corporate-doc-print print-document',
          sx: {
            borderRadius: { xs: 1, sm: 2 },
            bgcolor: '#f8fafc',
            p: { xs: 1, sm: 2 },
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
            position: 'relative',
            overflow: 'visible',
            '@media print': {
              bgcolor: '#ffffff',
              p: 0,
              boxShadow: 'none',
              border: 'none',
              borderRadius: 0,
            },
          },
        },
      }}
      aria-labelledby="printable-doc-title"
    >
      {/* BARRA SUPERIOR DE ACCIONES RÁPIDAS (SOLO PANTALLA) */}
      <DialogTitle
        className="no-print"
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pb: 1,
          pt: 1.5,
          px: 2,
        }}
      >
        <Typography component="span" variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
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

      {/* LIENZO DE LA HOJA DE DOCUMENTO OFICIAL (TIPO CARTA CONTABLE) */}
      <DialogContent sx={{ p: { xs: 1, sm: 2 }, '@media print': { p: 0 } }}>
        <Box
          className="document-sheet"
          sx={{
            bgcolor: '#ffffff',
            color: '#0f172a',
            p: { xs: 2.5, sm: 4 },
            borderRadius: 1,
            border: '1px solid #cbd5e1',
            boxShadow: { xs: 'none', sm: '0 4px 12px rgba(0,0,0,0.05)' },
            '@media print': {
              p: 0,
              border: 'none',
              boxShadow: 'none',
              width: '100%',
            },
          }}
        >
          {/* BANNER OFICIAL SI ESTÁ ANULADO */}
          {cancelled && (
            <Box
              sx={{
                mb: 2.5,
                p: 1.5,
                border: '2px dashed #b91c1c',
                borderRadius: 1,
                bgcolor: 'rgba(185, 28, 28, 0.06)',
                textAlign: 'center',
              }}
            >
              <Typography variant="h6" sx={{ fontWeight: 900, letterSpacing: 2, color: '#b91c1c', fontSize: '1rem' }}>
                *** DOCUMENTO ANULADO — SIN EFECTO FISCAL NI CONTABLE ***
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, color: '#991b1b', fontSize: '0.85rem' }}>
                {cancelledAt ? `Fecha de anulación: ${formatDateTime(cancelledAt)}` : ''}
                {cancelledByName ? ` • Anulado por: ${cancelledByName}` : ''}
              </Typography>
              {cancellationReason && (
                <Typography variant="caption" component="div" sx={{ mt: 0.5, color: '#7f1d1d', fontStyle: 'italic' }}>
                  Motivo: {cancellationReason}
                </Typography>
              )}
            </Box>
          )}

          {/* ENCABEZADO MEMBRETADO CORPORATIVO COLOMBIANO */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1.4fr 1fr' },
              gap: 2,
              pb: 2,
              borderBottom: '2px solid #0f172a',
              alignItems: 'stretch',
            }}
          >
            {/* COLUMNA IZQUIERDA: DATOS FISCALES DE LA EMPRESA */}
            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 900,
                  color: '#0f172a',
                  lineHeight: 1.2,
                  fontSize: { xs: '1.15rem', sm: '1.35rem' },
                  letterSpacing: 0.5,
                }}
              >
                {company.legalName}
              </Typography>
              {company.tradeName && company.tradeName !== company.legalName && (
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#334155', mt: 0.25 }}>
                  {company.tradeName}
                </Typography>
              )}
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a', mt: 0.5, fontSize: '0.9rem' }}>
                NIT: {company.taxIdFull}
              </Typography>
              <Typography variant="caption" sx={{ color: '#475569', mt: 0.25, fontSize: '0.8rem' }}>
                {company.address} {company.phone ? `• Tel: ${company.phone}` : ''}
              </Typography>
              <Typography variant="caption" sx={{ color: '#475569', fontSize: '0.8rem' }}>
                {company.email} • Barranquilla, Colombia
              </Typography>
            </Box>

            {/* COLUMNA DERECHA: RECUADRO OFICIAL DEL DOCUMENTO */}
            <Box
              sx={{
                border: '2px solid #0f172a',
                borderRadius: 1,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                bgcolor: '#ffffff',
              }}
            >
              {/* TÍTULO DEL DOCUMENTO */}
              <Box sx={{ bgcolor: '#0f172a', color: '#ffffff', py: 0.75, px: 1.5, textAlign: 'center' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', fontSize: '0.85rem' }}>
                  {documentType}
                </Typography>
              </Box>

              {/* NÚMERO CONSECUTIVO */}
              <Box sx={{ py: 1, px: 1.5, textAlign: 'center', bgcolor: '#f8fafc' }}>
                <Typography
                  id="printable-doc-title"
                  variant="h5"
                  sx={{ fontWeight: 900, color: '#0f172a', fontFamily: 'monospace', letterSpacing: 1 }}
                >
                  {documentNumber}
                </Typography>
              </Box>

              {/* FECHA Y ESTADO */}
              <Box
                sx={{
                  borderTop: '1px solid #cbd5e1',
                  px: 1.5,
                  py: 0.5,
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.75rem',
                  bgcolor: '#ffffff',
                }}
              >
                <Typography variant="caption" sx={{ color: '#475569', fontWeight: 600 }}>
                  Fecha: {formatDateTime(documentDate).slice(0, 10)}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    color: cancelled ? '#b91c1c' : '#15803d',
                  }}
                >
                  {cancelled ? 'ANULADO' : status || 'VIGENTE'}
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* CUERPO PRINCIPAL DEL DOCUMENTO */}
          <Box sx={{ mt: 2.5 }}>{children}</Box>

          {/* SECCIÓN FORMAL DE FIRMAS CONTABLES Y RESPONSABILIDAD */}
          {showSignatures && (
            <Box
              sx={{
                mt: 4,
                pt: 2,
                borderTop: '1px solid #e2e8f0',
                pageBreakInside: 'avoid',
              }}
            >
              <Typography variant="caption" sx={{ display: 'block', mb: 1.5, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.7rem' }}>
                Control de Auditoría y Firmas Responsables
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
                  gap: 1.5,
                }}
              >
                {/* 1. ELABORADO POR */}
                <Box
                  sx={{
                    border: '1px solid #94a3b8',
                    borderRadius: 1,
                    p: 1,
                    minHeight: '75px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#334155', fontSize: '0.7rem' }}>
                    ELABORADO POR:
                  </Typography>
                  <Box>
                    <Box sx={{ borderBottom: '1px dotted #94a3b8', mb: 0.5 }} />
                    <Typography variant="caption" sx={{ color: '#0f172a', fontWeight: 600, display: 'block', fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {createdByName || 'Usuario Sistema'}
                    </Typography>
                  </Box>
                </Box>

                {/* 2. REVISADO POR */}
                <Box
                  sx={{
                    border: '1px solid #94a3b8',
                    borderRadius: 1,
                    p: 1,
                    minHeight: '75px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#334155', fontSize: '0.7rem' }}>
                    REVISADO POR:
                  </Typography>
                  <Box>
                    <Box sx={{ borderBottom: '1px dotted #94a3b8', mb: 0.5 }} />
                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.68rem', display: 'block' }}>
                      Contabilidad / Auditoría
                    </Typography>
                  </Box>
                </Box>

                {/* 3. APROBADO POR */}
                <Box
                  sx={{
                    border: '1px solid #94a3b8',
                    borderRadius: 1,
                    p: 1,
                    minHeight: '75px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#334155', fontSize: '0.7rem' }}>
                    APROBADO POR:
                  </Typography>
                  <Box>
                    <Box sx={{ borderBottom: '1px dotted #94a3b8', mb: 0.5 }} />
                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.68rem', display: 'block' }}>
                      Gerencia / Tesorería
                    </Typography>
                  </Box>
                </Box>

                {/* 4. BENEFICIARIO / RECIBÍ CONFORME */}
                <Box
                  sx={{
                    border: '1px solid #94a3b8',
                    borderRadius: 1,
                    p: 1,
                    minHeight: '75px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 700, color: '#334155', fontSize: '0.68rem', lineHeight: 1.1 }}>
                    {recipientLabel}
                  </Typography>
                  <Box>
                    <Box sx={{ borderBottom: '1px dotted #94a3b8', mb: 0.5 }} />
                    <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.68rem', display: 'block' }}>
                      C.C. / NIT:
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Box>
          )}

          {/* PIE DE PÁGINA INSTITUCIONAL DEL DOCUMENTO */}
          <Box
            sx={{
              mt: 2.5,
              pt: 1,
              borderTop: '1px solid #cbd5e1',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: '#64748b',
              fontSize: '0.7rem',
            }}
          >
            <Typography variant="caption" sx={{ fontSize: 'inherit', color: 'inherit' }}>
              Documento oficial generado por FarmaControl • Sistema de Gestión Farmacéutica y Contable
            </Typography>
            <Typography variant="caption" sx={{ fontSize: 'inherit', color: 'inherit', fontWeight: 600 }}>
              Página 1 de 1
            </Typography>
          </Box>
        </Box>
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
          bgcolor: 'action.hover',
          borderTop: '1px solid #e2e8f0',
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
