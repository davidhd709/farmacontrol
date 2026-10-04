import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Divider,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
} from '@mui/material';
import type { SaleDto } from '@farmacia/contracts';

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
  if (!sale) return null;

  const handlePrint = () => {
    window.print();
  };

  React.useEffect(() => {
    if (!open) return;
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
  }, [open, onClose, onNewSale]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          className: 'sale-receipt-print',
          sx: {
            borderRadius: 2.5,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
          },
        },
      }}
    >
      <DialogTitle
        sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}
      >
        <Typography component="span" variant="h6" sx={{ fontWeight: 700 }}>
          Comprobante de Venta
        </Typography>
        <Chip
          label={sale.status === 'COMPLETED' ? 'Venta Confirmada' : 'Venta Anulada'}
          color={sale.status === 'COMPLETED' ? 'success' : 'error'}
          size="small"
        />
      </DialogTitle>

      <DialogContent dividers sx={{ '@media print': { p: 0 } }}>
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 800, color: 'primary.main' }}>
            Comprobante de venta
          </Typography>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mt: 1 }}>
            Comprobante N°: {sale.invoiceNumber}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Fecha: {new Date(sale.createdAt).toLocaleString('es-CO')}
          </Typography>
        </Box>

        <Divider sx={{ my: 1.5 }} />

        <Box sx={{ mb: 2, fontSize: '0.875rem' }}>
          <Typography variant="body2">
            <strong>Cliente:</strong> {sale.customerName} ({sale.customerDocument})
          </Typography>
          <Typography variant="body2">
            <strong>Atendido por:</strong> {sale.createdByUsername || 'Cajero POS'}
          </Typography>
          <Typography variant="body2">
            <strong>Medio de Pago:</strong> {sale.paymentMethod}
          </Typography>
        </Box>

        {/* Detalle de Artículos y Lotes FEFO */}
        <Table size="small" aria-label="detalle comprobante">
          <TableHead sx={{ bgcolor: 'action.hover' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Descripción / Lotes FEFO</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>
                Cant.
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>
                V. Unit
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>
                Descuento
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>
                Total línea
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sale.lines.map((line) => (
              <TableRow key={line.id} sx={{ verticalAlign: 'top' }}>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {line.productName}
                  </Typography>
                  {line.presentationName && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      Pres: {line.presentationName} (Factor: {line.presentationFactorHistorical})
                    </Typography>
                  )}
                  {/* Desglose de Lotes Asignados */}
                  {line.lotAllocations && line.lotAllocations.length > 0 && (
                    <Box sx={{ mt: 0.5 }}>
                      {line.lotAllocations.map((alloc) => (
                        <Typography
                          key={alloc.id}
                          variant="caption"
                          sx={{ display: 'block', color: 'text.secondary', fontSize: '0.75rem' }}
                        >
                          • Lote: <strong>{alloc.lotNumber || 'N/A'}</strong> (Vence:{' '}
                          {alloc.expirationDate || 'N/A'}) → {alloc.quantityBaseUnits} un. base
                        </Typography>
                      ))}
                    </Box>
                  )}
                </TableCell>
                <TableCell align="right">{line.quantityCommercial}</TableCell>
                <TableCell align="right">${line.unitPrice.toLocaleString('es-CO')}</TableCell>
                <TableCell align="right">${line.discount.toLocaleString('es-CO')}</TableCell>
                <TableCell align="right">${line.total.toLocaleString('es-CO')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Divider sx={{ my: 2 }} />

        {/* Liquidación Monetaria */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'flex-end' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '220px' }}>
            <Typography variant="body2">Subtotal:</Typography>
            <Typography variant="body2">${sale.subtotal.toLocaleString('es-CO')}</Typography>
          </Box>
          {sale.discountTotal > 0 && (
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                width: '220px',
                color: 'error.main',
              }}
            >
              <Typography variant="body2">Descuento:</Typography>
              <Typography variant="body2">
                -${sale.discountTotal.toLocaleString('es-CO')}
              </Typography>
            </Box>
          )}
          {sale.taxTotal > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '220px' }}>
              <Typography variant="body2">Impuestos:</Typography>
              <Typography variant="body2">${sale.taxTotal.toLocaleString('es-CO')}</Typography>
            </Box>
          )}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              width: '220px',
              mt: 0.5,
              pt: 0.5,
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Total:
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'primary.main' }}>
              ${sale.total.toLocaleString('es-CO')}
            </Typography>
          </Box>

          {sale.paymentMethod === 'EFECTIVO' && (
            <>
              <Box
                sx={{ display: 'flex', justifyContent: 'space-between', width: '220px', mt: 0.5 }}
              >
                <Typography variant="caption" color="text.secondary">
                  Recibido:
                </Typography>
                <Typography variant="caption">
                  ${sale.amountPaid.toLocaleString('es-CO')}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '220px' }}>
                <Typography variant="caption" color="text.secondary">
                  Cambio:
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  ${sale.changeGiven.toLocaleString('es-CO')}
                </Typography>
              </Box>
            </>
          )}
        </Box>
      </DialogContent>

      <DialogActions
        className="sale-receipt-no-print"
        sx={{ p: 2, display: 'flex', justifyContent: 'space-between' }}
      >
        <Button
          variant="outlined"
          color="primary"
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
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            onClick={onClose}
            color="inherit"
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
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
