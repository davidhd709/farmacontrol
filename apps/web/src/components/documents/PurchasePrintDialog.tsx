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
} from '@mui/material';
import type { PurchaseDto } from '@farmacia/contracts';
import { PrintableDocumentLayout } from './PrintableDocumentLayout';
import { formatCurrencyCop } from '../../utils/print-document';
import { numberToWordsCop } from '../../utils/number-to-words';

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

  const totalNum = Number((purchase as any).total ?? purchase.totalAmount) || 0;

  return (
    <PrintableDocumentLayout
      open={open}
      onClose={onClose}
      documentType="Comprobante de Recepción de Compra"
      documentNumber={purchase.invoiceNumber}
      documentDate={purchase.purchaseDate || purchase.createdAt}
      status={purchase.status}
      createdByName={purchase.receivedByUsername}
      recipientLabel="Firma y Cédula Proveedor / Transportador"
      actions={actions}
      maxWidth="lg"
    >
      {/* CUADRÍCULA FORMAL DE LA COMPRA */}
      <Box sx={{ mb: 2.5 }}>
        <Box
          sx={{
            border: '1px solid #334155',
            borderRadius: 1,
            overflow: 'hidden',
          }}
        >
          {/* FILA 1: PROVEEDOR Y CONDICIÓN DE PAGO */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1.4fr 1fr' },
              borderBottom: '1px solid #cbd5e1',
            }}
          >
            <Box sx={{ p: 1.5, borderRight: { sm: '1px solid #cbd5e1' } }}>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  color: '#475569',
                  fontWeight: 700,
                  fontSize: '0.72rem',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Proveedor:
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 800, color: '#0f172a', mt: 0.25 }}>
                {purchase.supplierName || 'Proveedor'}{' '}
                {purchase.supplierTaxId ? `(NIT: ${purchase.supplierTaxId})` : ''}
              </Typography>
            </Box>

            <Box sx={{ p: 1.5, bgcolor: '#f8fafc' }}>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  color: '#475569',
                  fontWeight: 700,
                  fontSize: '0.72rem',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Condición de Pago / Vencimiento:
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a', mt: 0.25 }}>
                {purchase.paymentCondition || 'Contado'}{' '}
                {purchase.dueDate ? `— Vence: ${purchase.dueDate}` : ''}
              </Typography>
            </Box>
          </Box>

          {/* FILA 2: RECEPCIÓN Y OBSERVACIONES */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1.4fr 1fr' },
            }}
          >
            <Box sx={{ p: 1.5, borderRight: { sm: '1px solid #cbd5e1' } }}>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  color: '#475569',
                  fontWeight: 700,
                  fontSize: '0.72rem',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Observaciones de Recepción:
              </Typography>
              <Typography variant="body2" sx={{ color: '#1e293b', mt: 0.25, fontStyle: purchase.notes ? 'normal' : 'italic' }}>
                {purchase.notes || 'Sin observaciones registradas.'}
              </Typography>
            </Box>

            <Box sx={{ p: 1.5, bgcolor: '#f8fafc' }}>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  color: '#475569',
                  fontWeight: 700,
                  fontSize: '0.72rem',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Recibido en Almacén por:
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a', mt: 0.25 }}>
                {purchase.receivedByUsername || 'Usuario responsable'}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* TABLA DE ARTÍCULOS Y LOTES RECIBIDOS */}
      <Box sx={{ mb: 2.5 }}>
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            mb: 0.75,
            color: '#334155',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            fontSize: '0.72rem',
          }}
        >
          Relación de Artículos y Lotes Ingresados al Inventario
        </Typography>
        <TableContainer
          sx={{
            border: '1px solid #334155',
            borderRadius: 1,
            overflow: 'hidden',
          }}
        >
          <Table size="small">
            <TableHead sx={{ bgcolor: '#0f172a' }}>
              <TableRow>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1 }}>
                  Producto / Presentación
                </TableCell>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1 }}>
                  Lote / Vencimiento
                </TableCell>
                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1 }}>
                  Cant.
                </TableCell>
                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1 }}>
                  Costo Unit.
                </TableCell>
                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1 }}>
                  IVA ($)
                </TableCell>
                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1 }}>
                  Total Línea
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {purchase.lines.map((line, idx) => (
                <TableRow
                  key={line.id || idx}
                  sx={{
                    bgcolor: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                    '& td': { borderBottom: '1px solid #e2e8f0', py: 0.75 },
                  }}
                >
                  <TableCell sx={{ fontWeight: 700, color: '#0f172a' }}>
                    {line.productName}
                    {line.presentationName && (
                      <Typography variant="caption" sx={{ display: 'block', color: '#64748b' }}>
                        Pres: {line.presentationName}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {line.lotNumber ? (
                      <>
                        <strong>{line.lotNumber}</strong>
                        {line.expirationDate && (
                          <Typography variant="caption" sx={{ display: 'block', color: '#64748b' }}>
                            Vence: {line.expirationDate}
                          </Typography>
                        )}
                      </>
                    ) : (
                      'Sin lote'
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800 }}>
                    {(line as any).quantity ?? line.quantityCommercial}
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                    {formatCurrencyCop(Number((line as any).costPrice ?? line.unitCost))}
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                    {formatCurrencyCop(Number(line.vatAmount || 0))}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, fontFamily: 'monospace' }}>
                    {formatCurrencyCop(Number(line.subtotal) + Number(line.vatAmount || 0))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* TOTALES Y VALOR EN LETRAS */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1.3fr 1fr' },
          gap: 2,
          alignItems: 'stretch',
          mb: 1,
        }}
      >
        {/* VALOR EN LETRAS */}
        <Box
          sx={{
            border: '1px solid #94a3b8',
            borderRadius: 1,
            p: 1.5,
            bgcolor: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              color: '#475569',
              fontWeight: 700,
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Valor Total de la Compra en Letras:
          </Typography>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 800,
              color: '#0f172a',
              fontStyle: 'italic',
              mt: 0.5,
              fontSize: '0.85rem',
            }}
          >
            SON: {numberToWordsCop(totalNum)}
          </Typography>
        </Box>

        {/* DESGLOSE DE TOTALES */}
        <Box
          sx={{
            border: '1px solid #334155',
            borderRadius: 1,
            overflow: 'hidden',
            bgcolor: '#ffffff',
          }}
        >
          <Box sx={{ p: 1, borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
            <Typography variant="caption" sx={{ color: '#475569', fontWeight: 600 }}>Subtotal:</Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
              {formatCurrencyCop(Number(purchase.subtotal))}
            </Typography>
          </Box>
          <Box sx={{ p: 1, borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
            <Typography variant="caption" sx={{ color: '#475569', fontWeight: 600 }}>IVA / Impuestos:</Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
              {formatCurrencyCop(Number(purchase.vatTotal || 0))}
            </Typography>
          </Box>
          <Box sx={{ p: 1, bgcolor: '#0f172a', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 900, letterSpacing: 0.5 }}>TOTAL COMPRA:</Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, fontFamily: 'monospace', color: '#ffffff' }}>
              {formatCurrencyCop(totalNum)}
            </Typography>
          </Box>
        </Box>
      </Box>
    </PrintableDocumentLayout>
  );
};
