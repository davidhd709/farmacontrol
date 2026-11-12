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
import type { PurchaseDto } from '@farmacia/contracts';
import { PrintableDocumentLayout } from './PrintableDocumentLayout';
import { formatCurrencyCop } from '../../utils/print-document';

interface Props {
  open: boolean;
  purchase: PurchaseDto | null;
  onClose: () => void;
  actions?: React.ReactNode;
}

export const PurchasePrintDialog: React.FC<Props> = ({
  open,
  purchase,
  onClose,
  actions,
}) => {
  if (!purchase) return null;

  return (
    <PrintableDocumentLayout
      open={open}
      onClose={onClose}
      documentType="Comprobante de Recepción de Compra"
      documentNumber={purchase.invoiceNumber}
      documentDate={purchase.purchaseDate || purchase.createdAt}
      status={purchase.status}
      actions={actions}
      maxWidth="lg"
    >
      {/* DATOS DE LA COMPRA */}
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
              {purchase.supplierName || 'Proveedor'}{' '}
              {purchase.supplierTaxId ? `(NIT: ${purchase.supplierTaxId})` : ''}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" component="div">
              Condición de Pago / Vencimiento:
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {purchase.paymentCondition || 'Contado'}{' '}
              {purchase.dueDate ? `— Vence: ${purchase.dueDate}` : ''}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" component="div">
              Recibido en Almacén por:
            </Typography>
            <Typography variant="body2">
              {purchase.receivedByUsername || 'Usuario responsable'}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" component="div">
              Estado:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {purchase.status}
            </Typography>
          </Box>

          {purchase.notes && (
            <Box sx={{ gridColumn: { xs: '1', sm: '1 / span 2' } }}>
              <Typography variant="caption" color="text.secondary" component="div">
                Observaciones:
              </Typography>
              <Typography variant="body2">{purchase.notes}</Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* DETALLE DE LÍNEAS DE COMPRA */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          Artículos y Lotes Recibidos
        </Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead sx={{ bgcolor: 'action.hover' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Producto / Presentación</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Lote / Vence</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  Cant.
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  Costo Unit.
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  IVA
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">
                  Total Línea
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {purchase.lines &&
                purchase.lines.map((line, idx) => (
                  <TableRow key={line.id || idx}>
                    <TableCell sx={{ fontWeight: 600 }}>
                      {line.productName || 'Producto'}
                      {line.presentationName ? ` (${line.presentationName})` : ''}
                    </TableCell>
                    <TableCell>
                      {line.lotNumber || 'Sin lote'}{' '}
                      {line.expirationDate ? `(Vence: ${line.expirationDate})` : ''}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {line.quantityCommercial}
                    </TableCell>
                    <TableCell align="right">{formatCurrencyCop(Number(line.unitCost))}</TableCell>
                    <TableCell align="right">{formatCurrencyCop(Number(line.vatAmount || 0))}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {formatCurrencyCop(Number(line.subtotal) + Number(line.vatAmount || 0))}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* TOTALES DE LA COMPRA */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Box sx={{ width: 320, p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Subtotal:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {formatCurrencyCop(Number(purchase.subtotal || 0))}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              IVA Compra:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {formatCurrencyCop(Number(purchase.vatTotal || 0))}
            </Typography>
          </Box>
          {(Number(purchase.withholdingIncome) > 0 ||
            Number(purchase.withholdingVat) > 0 ||
            Number(purchase.withholdingIca) > 0) && (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    Retenciones (RteFte/IVA/ICA):
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'error.main' }}>
                    -
                    {formatCurrencyCop(
                      Number(purchase.withholdingIncome || 0) +
                      Number(purchase.withholdingVat || 0) +
                      Number(purchase.withholdingIca || 0),
                    )}
                  </Typography>
                </Box>
              </>
            )}
          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              TOTAL FACTURA:
            </Typography>
            <Typography variant="h6" color="primary.main" sx={{ fontWeight: 800 }}>
              {formatCurrencyCop(Number(purchase.totalAmount || 0))}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Neto por Pagar:
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              {formatCurrencyCop(Number(purchase.payableAmount || purchase.totalAmount))}
            </Typography>
          </Box>
        </Box>
      </Box>
    </PrintableDocumentLayout>
  );
};
