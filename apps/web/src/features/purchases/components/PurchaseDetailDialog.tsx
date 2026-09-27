import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Divider,
} from '@mui/material';
import type { PurchaseDto } from '@farmacia/contracts';

interface PurchaseDetailDialogProps {
  open: boolean;
  onClose: () => void;
  purchase: PurchaseDto | null;
}

export const PurchaseDetailDialog: React.FC<PurchaseDetailDialogProps> = ({
  open,
  onClose,
  purchase,
}) => {
  if (!purchase) return null;

  // Extraer metadatos de factura de compra si existen
  let dueDate = purchase.dueDate;
  let paymentCondition = purchase.paymentCondition;
  let cleanNotes = purchase.notes;

  if (purchase.notes && purchase.notes.includes('[Factura Vence:')) {
    const matchDue = purchase.notes.match(/\[Factura Vence:\s*([^|\]]+)/);
    if (matchDue && !dueDate) dueDate = matchDue[1].trim();

    const matchCond = purchase.notes.match(/Condición:\s*([^\]]+)/);
    if (matchCond && !paymentCondition) paymentCondition = matchCond[1].trim();

    cleanNotes = purchase.notes.replace(/\[Factura Vence:[^\]]+\]\s*/, '').trim() || null;
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Detalle de Factura de Compra: {purchase.invoiceNumber}</span>
        <Chip label={purchase.status} color="success" size="small" sx={{ fontWeight: 'bold' }} />
      </DialogTitle>

      <DialogContent dividers>
        {/* Cabecera Informativa de Factura */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2, mb: 3 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">Proveedor</Typography>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {purchase.supplierName || '—'}
            </Typography>
            {purchase.supplierTaxId && (
              <Typography variant="caption" color="text.secondary">
                NIT: {purchase.supplierTaxId}
              </Typography>
            )}
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary">Fecha de Emisión Factura</Typography>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {purchase.purchaseDate}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary">Fecha de Vencimiento Factura</Typography>
            <Typography variant="body1" sx={{ fontWeight: 600, color: dueDate ? 'primary.main' : 'text.primary' }}>
              {dueDate || 'Inmediato (Contado)'}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary">Condición de Pago</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {paymentCondition || 'Contado'}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary">Recepcionado por</Typography>
            <Typography variant="body2">
              {purchase.receivedByUsername ? `@${purchase.receivedByUsername}` : 'Sistema'}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary">Fecha de Registro en Kardex</Typography>
            <Typography variant="body2">
              {new Date(purchase.createdAt).toLocaleString('es-CO')}
            </Typography>
          </Box>

          {cleanNotes && (
            <Box sx={{ gridColumn: '1 / -1' }}>
              <Typography variant="caption" color="text.secondary">Observaciones / Notas de Factura</Typography>
              <Typography variant="body2">{cleanNotes}</Typography>
            </Box>
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Tabla de Líneas */}
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1.5 }}>
          Productos y Lotes Recepcionados ({purchase.lines.length})
        </Typography>

        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead sx={{ bgcolor: 'action.hover' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>Producto</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Lote</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Vence</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: 'right' }}>Cant. Comercial</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: 'right' }}>Unidades Base</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: 'right' }}>Costo Unit.</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: 'right' }}>Subtotal</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {purchase.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {line.productName || line.productId}
                    </Typography>
                    {line.presentationName && (
                      <Typography variant="caption" color="text.secondary">
                        {line.presentationName}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {line.lotNumber}
                  </TableCell>
                  <TableCell>{line.expirationDate}</TableCell>
                  <TableCell sx={{ textAlign: 'right' }}>{line.quantityCommercial}</TableCell>
                  <TableCell sx={{ textAlign: 'right', fontWeight: 600 }}>{line.quantityBaseUnits}</TableCell>
                  <TableCell sx={{ textAlign: 'right' }}>${Number(line.unitCost).toLocaleString()}</TableCell>
                  <TableCell sx={{ textAlign: 'right', fontWeight: 'bold' }}>
                    ${Number(line.subtotal).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Total General */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
            Total Factura: ${Number(purchase.totalAmount).toLocaleString()}
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} variant="contained">
          Cerrar
        </Button>
      </DialogActions>
    </Dialog>
  );
};
