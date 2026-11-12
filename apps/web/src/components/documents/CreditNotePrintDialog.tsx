import React from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Divider,
} from '@mui/material';
import type { CreditNoteDto } from '@farmacia/contracts';
import { PrintableDocumentLayout } from './PrintableDocumentLayout';
import { formatCurrencyCop } from '../../utils/print-document';

interface Props {
  open: boolean;
  creditNote: CreditNoteDto | null;
  onClose: () => void;
  actions?: React.ReactNode;
}

const REFUND_LABELS: Record<string, string> = {
  EFECTIVO: 'Reembolso en Efectivo',
  TRANSFERENCIA: 'Transferencia Bancaria',
  CREDITO_CARTERA: 'Abono a Saldo en Cartera',
};

export const CreditNotePrintDialog: React.FC<Props> = ({
  open,
  creditNote,
  onClose,
  actions,
}) => {
  if (!creditNote) return null;

  return (
    <Box data-testid="credit-note-detail-dialog">
      <PrintableDocumentLayout
        open={open}
        onClose={onClose}
        documentType="Detalle de Nota Crédito"
        documentNumber={creditNote.creditNoteNumber}
        documentDate={creditNote.createdAt}
        status={creditNote.status}
        isCancelled={creditNote.status === 'ANULADA'}
        cancelledAt={creditNote.cancelledAt}
        cancelledByName={creditNote.cancelledByName}
        cancellationReason={creditNote.cancellationReason}
        actions={actions}
        maxWidth="md"
      >
      {/* DATOS DE LA NOTA CRÉDITO */}
      <Box sx={{ mb: 3 }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            gap: 2,
            p: 2,
            bgcolor: 'action.hover',
            borderRadius: 2,
            border: '1px solid #E0E0E0',
          }}
        >
          <Box>
            <Typography variant="caption" color="text.secondary" component="div">
              Cliente:
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 700 }}>
              {creditNote.customerName || 'Consumidor Final'}{' '}
              {creditNote.customerDocument ? `(${creditNote.customerDocument})` : ''}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" component="div">
              Factura de Venta Afectada:
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 700, color: 'primary.main' }}>
              {creditNote.saleInvoiceNumber || 'N/A'}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" component="div">
              Resolución de la Devolución:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {REFUND_LABELS[creditNote.refundMethod] || creditNote.refundMethod}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" component="div">
              Reintegro Físico a Inventario:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {creditNote.restock ? 'Sí (Retorno a Kardex de Lotes)' : 'No (Baja por defecto/merma)'}
            </Typography>
          </Box>

          <Box sx={{ gridColumn: { xs: '1', sm: '1 / span 2' } }}>
            <Typography variant="caption" color="text.secondary" component="div">
              Motivo de la Devolución:
            </Typography>
            <Typography variant="body2" sx={{ fontStyle: 'italic', mt: 0.5 }}>
              "{creditNote.reason}"
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" component="div">
              Elaborado por:
            </Typography>
            <Typography variant="body2">
              {creditNote.createdByName || 'Usuario del sistema'}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* TABLA DE PRODUCTOS DEVUELTOS */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          Detalle de Artículos Devueltos
        </Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead sx={{ bgcolor: 'action.hover' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Producto</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Lote</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  Cant.
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  V. Unitario
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  IVA / INC
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  Total
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {creditNote.lines.map((line, idx) => {
                const taxes = Number(line.taxAmount || 0);
                return (
                  <TableRow key={line.id || idx}>
                    <TableCell sx={{ fontWeight: 600 }}>{line.productName || 'Producto'}</TableCell>
                    <TableCell>{line.lotNumber || 'Sin lote'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {line.quantityCommercial}
                    </TableCell>
                    <TableCell align="right">{formatCurrencyCop(Number(line.unitPrice))}</TableCell>
                    <TableCell align="right">{formatCurrencyCop(taxes)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {formatCurrencyCop(Number(line.total))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* TOTALES DE LA NOTA CRÉDITO */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Box sx={{ width: 280, p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Subtotal:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {formatCurrencyCop(Number(creditNote.subtotal))}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Impuestos (IVA / INC):
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {formatCurrencyCop(Number(creditNote.taxTotal))}
            </Typography>
          </Box>
          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              TOTAL:
            </Typography>
            <Typography variant="h6" color="primary.main" sx={{ fontWeight: 800 }}>
              {formatCurrencyCop(Number(creditNote.total))}
            </Typography>
          </Box>
        </Box>
      </Box>
    </PrintableDocumentLayout>
    </Box>
  );
};
