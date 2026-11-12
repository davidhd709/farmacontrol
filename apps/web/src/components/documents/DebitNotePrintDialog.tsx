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
import type { DebitNoteDto } from '@farmacia/contracts';
import { PrintableDocumentLayout } from './PrintableDocumentLayout';
import { formatCurrencyCop } from '../../utils/print-document';
import { numberToWordsCop } from '../../utils/number-to-words';

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

  const totalNum = Number(debitNote.total) || 0;

  return (
    <PrintableDocumentLayout
      open={open}
      onClose={onClose}
      documentType="Nota Débito a Proveedor"
      documentNumber={debitNote.debitNoteNumber}
      documentDate={debitNote.createdAt}
      status="CONFIRMADA"
      createdByName={debitNote.createdByName}
      recipientLabel="Firma y Cédula / Sello Proveedor"
      actions={actions}
      maxWidth="md"
    >
      {/* CUADRÍCULA FORMAL DE LA NOTA DÉBITO */}
      <Box sx={{ mb: 2.5 }}>
        <Box
          sx={{
            border: '1px solid #334155',
            borderRadius: 1,
            overflow: 'hidden',
          }}
        >
          {/* FILA 1: PROVEEDOR Y FACTURA DE COMPRA AFECTADA */}
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
                Proveedor / Beneficiario:
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 800, color: '#0f172a', mt: 0.25 }}>
                {debitNote.supplierName || 'Proveedor'}{' '}
                {debitNote.supplierTaxId ? `(NIT: ${debitNote.supplierTaxId})` : ''}
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
                Factura de Compra Afectada:
              </Typography>
              <Typography
                variant="body1"
                sx={{ fontWeight: 800, color: '#0f172a', fontFamily: 'monospace', mt: 0.25 }}
              >
                {debitNote.purchaseInvoiceNumber || 'N/A'}
              </Typography>
            </Box>
          </Box>

          {/* FILA 2: MOTIVO DE LA DEVOLUCIÓN Y REGISTRADO POR */}
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
                Motivo de la Devolución a Proveedor:
              </Typography>
              <Typography variant="body2" sx={{ color: '#1e293b', fontWeight: 600, mt: 0.25 }}>
                {debitNote.reason ? `"${debitNote.reason}"` : 'Devolución comercial de mercancía.'}
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
                Registrado por:
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a', mt: 0.25 }}>
                {debitNote.createdByName || 'Usuario del sistema'}
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* TABLA DE ARTÍCULOS DEVUELTOS AL PROVEEDOR */}
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
          Artículos Devueltos al Proveedor (Descargo de Inventario)
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
                  Producto / Descripción
                </TableCell>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1 }}>
                  Lote
                </TableCell>
                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1 }}>
                  Cant. Devuelta
                </TableCell>
                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1 }}>
                  Costo Unitario
                </TableCell>
                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1 }}>
                  IVA ($)
                </TableCell>
                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1 }}>
                  Total Débito
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {debitNote.lines && debitNote.lines.length > 0 ? (
                debitNote.lines.map((line, idx) => (
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
                      {formatCurrencyCop(Number(line.unitCost))}
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                      {formatCurrencyCop(Number(line.taxAmount || 0))}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, fontFamily: 'monospace' }}>
                      {formatCurrencyCop(Number(line.total || 0))}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 2, color: '#64748b' }}>
                    Sin artículos devueltos detallados.
                  </TableCell>
                </TableRow>
              )}
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
            Valor Total de la Nota Débito en Letras:
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
          <Box
            sx={{
              p: 1,
              borderBottom: '1px solid #cbd5e1',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.8rem',
            }}
          >
            <Typography variant="caption" sx={{ color: '#475569', fontWeight: 600 }}>
              Subtotal:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
              {formatCurrencyCop(Number(debitNote.subtotal || 0))}
            </Typography>
          </Box>
          <Box
            sx={{
              p: 1,
              borderBottom: '1px solid #cbd5e1',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.8rem',
            }}
          >
            <Typography variant="caption" sx={{ color: '#475569', fontWeight: 600 }}>
              IVA / Impuestos:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
              {formatCurrencyCop(Number(debitNote.taxTotal || 0))}
            </Typography>
          </Box>
          <Box
            sx={{
              p: 1,
              bgcolor: '#0f172a',
              color: '#ffffff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 900, letterSpacing: 0.5 }}>
              TOTAL DÉBITO:
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, fontFamily: 'monospace', color: '#ffffff' }}>
              {formatCurrencyCop(totalNum)}
            </Typography>
          </Box>
        </Box>
      </Box>
    </PrintableDocumentLayout>
  );
};
