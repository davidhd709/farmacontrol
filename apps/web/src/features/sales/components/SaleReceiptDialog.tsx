import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Table,
  TableContainer,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  Stack,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import type { SaleDto } from '@farmacia/contracts';
import { expirationDateLabel, lotNumberLabel } from '../../catalog/utils/inventory-control';
import { formatDateTime } from '../../../utils/date-format';
import { printDocument, downloadDocumentPdf } from '../../../utils/print-document';

interface SaleReceiptDialogProps {
  open: boolean;
  sale: SaleDto | null;
  onClose: () => void;
  onNewSale?: () => void;
}

export const SaleReceiptDialog: React.FC<SaleReceiptDialogProps> = ({
  open,
  sale,
  onClose,
  onNewSale,
}) => {
  const handlePrint = () => {
    if (!sale) return;
    printDocument(`${sale.invoiceNumber}_Tirilla_Venta`);
  };

  const handleDownloadPdf = () => {
    if (!sale) return;
    downloadDocumentPdf(`${sale.invoiceNumber}_Tirilla_Venta`);
  };

  React.useEffect(() => {
    if (!open || !sale) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (onNewSale) {
          onNewSale();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, sale, onClose, onNewSale]);

  if (!sale) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{
        paper: {
          className: 'sale-receipt-print print-document',
          sx: {
            borderRadius: 2,
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
            bgcolor: '#ffffff',
            maxWidth: '420px',
            overflow: 'visible',
          },
        },
      }}
    >
      <DialogTitle
        className="no-print"
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          py: 1.5,
          px: 2,
          bgcolor: 'action.hover',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <Typography component="span" variant="h6" sx={{ fontWeight: 700 }}>
          Comprobante de Venta
        </Typography>
        <Chip
          label={sale.status === 'COMPLETED' ? 'Venta Confirmada' : 'Venta Anulada'}
          color={sale.status === 'COMPLETED' ? 'success' : 'error'}
          size="small"
          sx={{ fontWeight: 700, fontSize: '0.75rem' }}
        />
      </DialogTitle>

      <DialogContent sx={{ p: { xs: 1.5, sm: 2 }, '@media print': { p: 0 } }}>
        {/* LIENZO DE LA TIRILLA TÉRMICA POS */}
        <Box
          sx={{
            width: '100%',
            maxWidth: '380px',
            mx: 'auto',
            p: { xs: 1.5, sm: 2 },
            bgcolor: '#ffffff',
            color: '#000000',
            fontFamily: "'Courier New', Courier, monospace",
            border: '1px dashed #cbd5e1',
            borderRadius: 1,
            boxShadow: { xs: 'none', sm: '0 2px 8px rgba(0,0,0,0.06)' },
            '@media print': {
              maxWidth: '100%',
              p: 0,
              border: 'none',
              boxShadow: 'none',
            },
          }}
        >
          {/* ENCABEZADO DEL ESTABLECIMIENTO */}
          <Box sx={{ textAlign: 'center', mb: 1.5 }}>
            <Typography
              sx={{
                fontFamily: 'inherit',
                fontWeight: 900,
                fontSize: '1.2rem',
                letterSpacing: 1.5,
                lineHeight: 1.2,
              }}
            >
              FARMACONTROL
            </Typography>
            <Typography sx={{ fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 700, letterSpacing: 0.5 }}>
              DROGUERÍA Y FARMACIA
            </Typography>
            <Typography sx={{ fontFamily: 'inherit', fontSize: '0.75rem', color: '#475569' }}>
              Calle Principal # 12-34 • Tel: (605) 300-1234
            </Typography>
            <Typography sx={{ fontFamily: 'inherit', fontSize: '0.75rem', color: '#475569' }}>
              Barranquilla, Colombia
            </Typography>
          </Box>

          {/* DATOS DE LA VENTA / TICKET */}
          <Box
            sx={{
              borderTop: '1px dashed #000000',
              borderBottom: '1px dashed #000000',
              py: 1,
              my: 1.5,
              fontSize: '0.8rem',
            }}
          >
            <Box sx={{ textAlign: 'center', my: 0.5 }}>
              <Typography sx={{ fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700 }}>
                Comprobante N°: {sale.invoiceNumber}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
              <Typography sx={{ fontFamily: 'inherit', fontSize: '0.75rem' }}>Fecha:</Typography>
              <Typography sx={{ fontFamily: 'inherit', fontSize: '0.75rem' }}>
                {formatDateTime(sale.createdAt)}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
              <Typography sx={{ fontFamily: 'inherit', fontSize: '0.75rem' }}>Cliente:</Typography>
              <Typography sx={{ fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 600 }}>
                {sale.customerName} ({sale.customerDocument})
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
              <Typography sx={{ fontFamily: 'inherit', fontSize: '0.75rem' }}>Atendido por:</Typography>
              <Typography sx={{ fontFamily: 'inherit', fontSize: '0.75rem' }}>
                {sale.createdByUsername || 'Cajero POS'}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
              <Typography sx={{ fontFamily: 'inherit', fontSize: '0.75rem' }}>Condición:</Typography>
              <Typography sx={{ fontFamily: 'inherit', fontSize: '0.75rem' }}>
                {sale.paymentMethod === 'CREDITO'
                  ? 'Crédito'
                  : `Contado (${sale.paymentMethod === 'TRANSFERENCIA' ? 'transferencia' : 'efectivo'})`}
              </Typography>
            </Box>
          </Box>

          {/* MARCA VISIBLE SI LA VENTA FUE ANULADA */}
          {sale.status !== 'COMPLETED' && (
            <Box
              sx={{
                border: '2px solid #E05656',
                p: 0.5,
                my: 1,
                textAlign: 'center',
                bgcolor: 'rgba(224, 86, 86, 0.08)',
              }}
            >
              <Typography sx={{ fontFamily: 'inherit', fontWeight: 900, color: 'error.main', fontSize: '0.9rem' }}>
                *** VENTA ANULADA ***
              </Typography>
            </Box>
          )}

          {/* TABLA DE PRODUCTOS EN FORMATO TIRILLA */}
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label="detalle comprobante" sx={{ '& td, & th': { py: 0.5, px: 0.5, border: 'none' } }}>
              <TableHead sx={{ borderBottom: '1px dashed #000000' }}>
                <TableRow>
                  <TableCell sx={{ fontFamily: 'inherit', fontWeight: 700, fontSize: '0.75rem' }}>
                    Descripción / Lotes FEFO
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'inherit', fontWeight: 700, fontSize: '0.75rem' }}>
                    Cant.
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'inherit', fontWeight: 700, fontSize: '0.75rem' }}>
                    V. Unit
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'inherit', fontWeight: 700, fontSize: '0.75rem' }}>
                    Descuento
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'inherit', fontWeight: 700, fontSize: '0.75rem' }}>
                    Total línea
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sale.lines.map((line) => (
                  <TableRow key={line.id} sx={{ verticalAlign: 'top', borderBottom: '1px dotted #e2e8f0' }}>
                    <TableCell sx={{ fontFamily: 'inherit', fontSize: '0.75rem' }}>
                      <Typography sx={{ fontFamily: 'inherit', fontWeight: 700, fontSize: '0.75rem' }}>
                        {line.productName}
                      </Typography>
                      {line.presentationName && (
                        <Typography sx={{ fontFamily: 'inherit', fontSize: '0.68rem', color: '#64748b', display: 'block' }}>
                          Pres: {line.presentationName} (Factor: {line.presentationFactorHistorical})
                        </Typography>
                      )}
                      {line.lotAllocations && line.lotAllocations.length > 0 && (
                        <Box sx={{ mt: 0.25 }}>
                          {line.lotAllocations.map((alloc) => (
                            <Typography
                              key={alloc.id}
                              sx={{ fontFamily: 'inherit', display: 'block', color: '#64748b', fontSize: '0.68rem' }}
                            >
                              • Lote: {lotNumberLabel(alloc.lotNumber)} (Vence: {expirationDateLabel(alloc.expirationDate)}) → {alloc.quantityBaseUnits} un.
                            </Typography>
                          ))}
                        </Box>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'inherit', fontSize: '0.75rem' }}>
                      {line.quantityCommercial}
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'inherit', fontSize: '0.75rem' }}>
                      ${line.unitPrice.toLocaleString('es-CO')}
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'inherit', fontSize: '0.75rem' }}>
                      ${line.discount.toLocaleString('es-CO')}
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'inherit', fontWeight: 700, fontSize: '0.75rem' }}>
                      ${line.total.toLocaleString('es-CO')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {/* LIQUIDACIÓN DE TOTALES */}
          <Box sx={{ borderTop: '1px dashed #000000', pt: 1, mt: 1.5, fontSize: '0.8rem' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
              <Typography sx={{ fontFamily: 'inherit', fontSize: 'inherit' }}>Subtotal:</Typography>
              <Typography sx={{ fontFamily: 'inherit', fontSize: 'inherit' }}>
                ${sale.subtotal.toLocaleString('es-CO')}
              </Typography>
            </Box>
            {sale.discountTotal > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25, color: 'error.main' }}>
                <Typography sx={{ fontFamily: 'inherit', fontSize: 'inherit' }}>Descuento:</Typography>
                <Typography sx={{ fontFamily: 'inherit', fontSize: 'inherit' }}>
                  -${sale.discountTotal.toLocaleString('es-CO')}
                </Typography>
              </Box>
            )}
            {sale.taxTotal > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                <Typography sx={{ fontFamily: 'inherit', fontSize: 'inherit' }}>Impuestos:</Typography>
                <Typography sx={{ fontFamily: 'inherit', fontSize: 'inherit' }}>
                  ${sale.taxTotal.toLocaleString('es-CO')}
                </Typography>
              </Box>
            )}

            {/* TOTAL DESTACADO */}
            <Box
              sx={{
                borderTop: '1px solid #000000',
                borderBottom: '1px solid #000000',
                py: 0.5,
                my: 0.75,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Typography sx={{ fontFamily: 'inherit', fontWeight: 900, fontSize: '1rem' }}>
                TOTAL:
              </Typography>
              <Typography sx={{ fontFamily: 'inherit', fontWeight: 900, fontSize: '1.1rem' }}>
                ${sale.total.toLocaleString('es-CO')}
              </Typography>
            </Box>

            {/* PAGO EN EFECTIVO Y CAMBIO */}
            {sale.paymentMethod === 'EFECTIVO' && (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', mb: 0.25 }}>
                  <Typography sx={{ fontFamily: 'inherit', fontSize: 'inherit', color: '#475569' }}>
                    Recibido:
                  </Typography>
                  <Typography sx={{ fontFamily: 'inherit', fontSize: 'inherit' }}>
                    ${sale.amountPaid.toLocaleString('es-CO')}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700 }}>
                  <Typography sx={{ fontFamily: 'inherit', fontSize: 'inherit' }}>
                    Cambio:
                  </Typography>
                  <Typography sx={{ fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 700 }}>
                    ${sale.changeGiven.toLocaleString('es-CO')}
                  </Typography>
                </Box>
              </>
            )}
          </Box>

          {/* PIE DE PÁGINA TIRILLA */}
          <Box sx={{ textAlign: 'center', mt: 2, pt: 1, borderTop: '1px dashed #000000', fontSize: '0.7rem' }}>
            <Typography sx={{ fontFamily: 'inherit', fontWeight: 700, fontSize: '0.75rem' }}>
              ¡GRACIAS POR SU COMPRA!
            </Typography>
            <Typography sx={{ fontFamily: 'inherit', fontSize: '0.7rem', color: '#475569', mt: 0.5 }}>
              Conserve este comprobante para cualquier cambio o reclamo.
            </Typography>
            <Typography sx={{ fontFamily: 'inherit', fontSize: '0.65rem', color: '#94a3b8', mt: 0.5 }}>
              Software FarmaControl • {sale.lines.length} ítem(s) vendidos
            </Typography>
          </Box>
        </Box>
      </DialogContent>

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
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              transition: 'transform 0.1s ease',
              '&:active': { transform: 'scale(0.98)' },
            }}
          >
            Imprimir Comprobante
          </Button>
          <Button
            variant="outlined"
            color="primary"
            startIcon={<PictureAsPdfIcon />}
            onClick={handleDownloadPdf}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              transition: 'transform 0.1s ease',
              '&:active': { transform: 'scale(0.98)' },
            }}
          >
            Descargar PDF
          </Button>
        </Stack>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={onClose} color="inherit" sx={{ textTransform: 'none', fontWeight: 600 }}>
            Cerrar
          </Button>
          {onNewSale && (
            <Button
              variant="contained"
              color="success"
              onClick={onNewSale}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                transition: 'transform 0.1s ease, background-color 0.15s ease',
                '&:active': { transform: 'scale(0.98)' },
              }}
            >
              Nueva Venta (Enter)
            </Button>
          )}
        </Box>
      </DialogActions>
    </Dialog>
  );
};
