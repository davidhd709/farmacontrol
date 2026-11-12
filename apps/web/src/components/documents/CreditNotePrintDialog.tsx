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
import type { CreditNoteDto } from '@farmacia/contracts';
import { PrintableDocumentLayout } from './PrintableDocumentLayout';
import { formatCurrencyCop } from '../../utils/print-document';
import { numberToWordsCop } from '../../utils/number-to-words';

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

  const totalNum = Number(creditNote.total) || 0;

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
        createdByName={creditNote.createdByName}
        recipientLabel="Firma y Cédula del Cliente (Aceptación Devolución)"
        actions={actions}
        maxWidth="md"
      >
        {/* CUADRÍCULA FORMAL DE LA NOTA CRÉDITO */}
        <Box sx={{ mb: 2.5 }}>
          <Box
            sx={{
              border: '1px solid #334155',
              borderRadius: 1,
              overflow: 'hidden',
            }}
          >
            {/* FILA 1: CLIENTE Y FACTURA AFECTADA */}
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
                  Cliente:
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 800, color: '#0f172a', mt: 0.25 }}>
                  {creditNote.customerName || 'Consumidor Final'}{' '}
                  {creditNote.customerDocument ? `(${creditNote.customerDocument})` : ''}
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
                  Factura de Venta Afectada:
                </Typography>
                <Typography
                  variant="body1"
                  sx={{ fontWeight: 900, color: '#0f172a', fontFamily: 'monospace', mt: 0.25 }}
                >
                  {creditNote.saleInvoiceNumber || 'N/A'}
                </Typography>
              </Box>
            </Box>

            {/* FILA 2: RESOLUCIÓN Y REINTEGRO FÍSICO */}
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
                  Forma de Resolución / Reembolso:
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#1e293b', mt: 0.25 }}>
                  {REFUND_LABELS[creditNote.refundMethod] || creditNote.refundMethod}
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
                  Reintegro Físico a Inventario:
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a', mt: 0.25 }}>
                  {creditNote.restock ? 'Sí (Retorno a Kardex de Lotes)' : 'No (Baja por defecto/merma)'}
                </Typography>
              </Box>
            </Box>

            {/* FILA 3: MOTIVO DE LA DEVOLUCIÓN */}
            <Box sx={{ p: 1.5 }}>
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
                Motivo de la Devolución:
              </Typography>
              <Typography variant="body2" sx={{ fontStyle: 'italic', color: '#1e293b', mt: 0.25 }}>
                "{creditNote.reason}"
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* TABLA DE PRODUCTOS DEVUELTOS */}
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
            Detalle de Artículos Devueltos
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
                    Producto
                  </TableCell>
                  <TableCell sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1 }}>
                    Lote
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1 }}>
                    Cant.
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1 }}>
                    V. Unitario
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1 }}>
                    IVA / INC
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1 }}>
                    Total
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {creditNote.lines.map((line, idx) => {
                  const taxes = Number(line.taxAmount || 0);
                  return (
                    <TableRow
                      key={line.id || idx}
                      sx={{
                        bgcolor: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                        '& td': { borderBottom: '1px solid #e2e8f0', py: 0.75 },
                      }}
                    >
                      <TableCell sx={{ fontWeight: 700, color: '#0f172a' }}>
                        {line.productName || 'Producto'}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {line.lotNumber || 'Sin lote'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>
                        {line.quantityCommercial}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                        {formatCurrencyCop(Number(line.unitPrice))}
                      </TableCell>
                      <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                        {formatCurrencyCop(taxes)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800, fontFamily: 'monospace' }}>
                        {formatCurrencyCop(Number(line.total))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>

        {/* LIQUIDACIÓN DE TOTALES Y VALOR EN LETRAS */}
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
              Valor en Letras:
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
                {formatCurrencyCop(Number(creditNote.subtotal))}
              </Typography>
            </Box>
            <Box sx={{ p: 1, borderBottom: '1px solid #cbd5e1', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <Typography variant="caption" sx={{ color: '#475569', fontWeight: 600 }}>Impuestos (IVA / INC):</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                {formatCurrencyCop(Number(creditNote.taxTotal))}
              </Typography>
            </Box>
            <Box sx={{ p: 1, bgcolor: '#0f172a', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 900, letterSpacing: 0.5 }}>TOTAL NOTA CRÉDITO:</Typography>
              <Typography variant="h6" sx={{ fontWeight: 900, fontFamily: 'monospace', color: '#ffffff' }}>
                {formatCurrencyCop(totalNum)}
              </Typography>
            </Box>
          </Box>
        </Box>
      </PrintableDocumentLayout>
    </Box>
  );
};
