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
import type { DebitNoteDto } from '@farmacia/contracts';
import { PrintableDocumentLayout } from './PrintableDocumentLayout';
import { formatCurrencyCop } from '../../utils/print-document';

interface Props {
  open: boolean;
  debitNote: DebitNoteDto | null;
  onClose: () => void;
  actions?: React.ReactNode;
}

export const DebitNotePrintDialog: React.FC<Props> = ({
  open,
  debitNote,
  onClose,
  actions,
}) => {
  if (!debitNote) return null;

  return (
    <PrintableDocumentLayout
      open={open}
      onClose={onClose}
      documentType="Nota Débito a Proveedor"
      documentNumber={debitNote.debitNoteNumber}
      documentDate={debitNote.createdAt}
      status="CONFIRMADA"
      actions={actions}
      maxWidth="md"
    >
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
              Proveedor:
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 700 }}>
              {debitNote.supplierName || 'Proveedor'}{' '}
              {debitNote.supplierTaxId ? `(NIT: ${debitNote.supplierTaxId})` : ''}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" component="div">
              Factura de Compra Afectada:
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 700, color: 'primary.main' }}>
              {debitNote.purchaseInvoiceNumber || 'N/A'}
            </Typography>
          </Box>

          <Box sx={{ gridColumn: { xs: '1', sm: '1 / span 2' } }}>
            <Typography variant="caption" color="text.secondary" component="div">
              Motivo de la Devolución a Proveedor:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {debitNote.reason}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" component="div">
              Registrado por:
            </Typography>
            <Typography variant="body2">
              {debitNote.createdByName || 'Usuario del sistema'}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* DETALLE DE LÍNEAS DEVUELTAS */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          Artículos Devueltos al Proveedor
        </Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead sx={{ bgcolor: 'action.hover' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Producto</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Lote</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  Cant. Devuelta
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  Costo Unitario
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  IVA
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  Total
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {debitNote.lines &&
                debitNote.lines.map((line, idx) => (
                  <TableRow key={line.id || idx}>
                    <TableCell sx={{ fontWeight: 600 }}>{line.productName || 'Producto'}</TableCell>
                    <TableCell>{line.lotNumber || 'Sin lote'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {line.quantityCommercial}
                    </TableCell>
                    <TableCell align="right">{formatCurrencyCop(Number(line.unitCost))}</TableCell>
                    <TableCell align="right">{formatCurrencyCop(Number(line.taxAmount || 0))}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {formatCurrencyCop(Number(line.total || 0))}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* TOTALES */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Box sx={{ width: 280, p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Subtotal:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {formatCurrencyCop(Number(debitNote.subtotal || 0))}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              IVA:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {formatCurrencyCop(Number(debitNote.taxTotal || 0))}
            </Typography>
          </Box>
          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              TOTAL DÉBITO:
            </Typography>
            <Typography variant="h6" color="primary.main" sx={{ fontWeight: 800 }}>
              {formatCurrencyCop(Number(debitNote.total || 0))}
            </Typography>
          </Box>
        </Box>
      </Box>
    </PrintableDocumentLayout>
  );
};
