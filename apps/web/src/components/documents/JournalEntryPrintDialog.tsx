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
import type { JournalEntryDto } from '@farmacia/contracts';
import { PrintableDocumentLayout } from './PrintableDocumentLayout';
import { formatCurrencyCop } from '../../utils/print-document';
import { numberToWordsCop } from '../../utils/number-to-words';

interface Props {
  open: boolean;
  entry: JournalEntryDto | null;
  onClose: () => void;
  actions?: React.ReactNode;
}

export const JournalEntryPrintDialog: React.FC<Props> = ({
  open,
  entry,
  onClose,
  actions,
}) => {
  if (!entry) return null;

  const docNumber =
    entry.sourceDocument?.number ||
    (entry as any).consecutiveNumber ||
    `ASI-${entry.id.slice(0, 8).toUpperCase()}`;

  const isManualNote = entry.sourceType === 'MANUAL_NOTE';
  const docTitle = isManualNote ? 'Comprobante / Nota de Contabilidad' : 'Asiento del Libro Diario';
  const totalDebit = Number(entry.totalDebit) || 0;
  const totalCredit = Number(entry.totalCredit) || 0;
  const isBalanced = totalDebit === totalCredit && totalDebit > 0;

  return (
    <PrintableDocumentLayout
      open={open}
      onClose={onClose}
      documentType={docTitle}
      documentNumber={docNumber}
      documentDate={entry.entryDate || entry.createdAt}
      status={entry.status}
      isCancelled={Boolean(entry.reversedByEntryId || entry.reversalOfId)}
      cancellationReason={entry.reversalReason}
      createdByName={entry.createdByName || 'Motor Contable'}
      recipientLabel="Contador Público / Revisor Fiscal"
      actions={actions}
      maxWidth="lg"
    >
      {/* CUADRÍCULA FORMAL DEL ASIENTO / COMPROBANTE */}
      <Box sx={{ mb: 2.5 }}>
        <Box
          sx={{
            border: '1px solid #334155',
            borderRadius: 1,
            overflow: 'hidden',
          }}
        >
          {/* FILA 1: CONCEPTO / GLOSA CONTABLE */}
          <Box sx={{ p: 1.5, borderBottom: '1px solid #cbd5e1' }}>
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
              Concepto / Glosa General Contable:
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 800, color: '#0f172a', mt: 0.25 }}>
              {entry.description || 'Sin concepto detallado.'}
            </Typography>
          </Box>

          {/* FILA 2: ORIGEN Y CONTABILIZACIÓN */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' },
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
                Origen / Tipo de Fuente:
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a', mt: 0.25 }}>
                {entry.sourceType} {entry.sourceDocument ? `(${entry.sourceDocument.number})` : ''}
              </Typography>
            </Box>

            <Box sx={{ p: 1.5, borderRight: { sm: '1px solid #cbd5e1' }, bgcolor: '#f8fafc' }}>
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
                Elaborado / Contabilizado por:
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a', mt: 0.25 }}>
                {entry.createdByName || 'Motor Contable Automático'}
              </Typography>
            </Box>

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
                Fecha de Contabilización:
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a', mt: 0.25 }}>
                {entry.postedAt || entry.entryDate || entry.createdAt}
              </Typography>
            </Box>
          </Box>

          {entry.reversalReason && (
            <Box
              sx={{
                p: 1.5,
                borderTop: '1px solid #cbd5e1',
                bgcolor: 'rgba(239, 68, 68, 0.08)',
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  color: '#b91c1c',
                  fontWeight: 800,
                  fontSize: '0.72rem',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                Motivo de Reversión del Asiento:
              </Typography>
              <Typography variant="body2" sx={{ color: '#991b1b', fontWeight: 600, mt: 0.25 }}>
                {entry.reversalReason}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* TABLA DE DISTRIBUCIÓN PUC (PARTIDAS CONTABLES) */}
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
          Distribución de Cuentas del Plan Único de Cuentas (PUC)
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
                <TableCell sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1, width: '16%' }}>
                  Código PUC
                </TableCell>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1, width: '34%' }}>
                  Denominación de la Cuenta
                </TableCell>
                <TableCell sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1, width: '24%' }}>
                  Tercero / Glosa de Partida
                </TableCell>
                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1, width: '13%' }}>
                  Débito
                </TableCell>
                <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1, width: '13%' }}>
                  Crédito
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entry.lines && entry.lines.length > 0 ? (
                entry.lines.map((line, idx) => (
                  <TableRow
                    key={line.id || idx}
                    sx={{
                      bgcolor: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                      '& td': { borderBottom: '1px solid #e2e8f0', py: 0.75 },
                    }}
                  >
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 800, color: '#0f172a' }}>
                      {line.accountCode}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#1e293b' }}>
                      {line.accountName}
                    </TableCell>
                    <TableCell sx={{ color: '#475569', fontSize: '0.8rem' }}>
                      {line.description || '-'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                      {Number(line.debit) > 0 ? formatCurrencyCop(Number(line.debit)) : '-'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                      {Number(line.credit) > 0 ? formatCurrencyCop(Number(line.credit)) : '-'}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 2, color: '#64748b' }}>
                    Sin líneas contables registradas.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* SUMAS IGUALES, PARTIDA DOBLE Y VALOR EN LETRAS */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1.2fr 1.1fr' },
          gap: 2,
          alignItems: 'stretch',
          mb: 1,
        }}
      >
        {/* VALOR EN LETRAS Y ESTADO DE PARTIDA DOBLE */}
        <Box
          sx={{
            border: '1px solid #94a3b8',
            borderRadius: 1,
            p: 1.5,
            bgcolor: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <Box>
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
              Valor Contabilizado en Letras (Base Débito):
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
              SON: {numberToWordsCop(totalDebit)}
            </Typography>
          </Box>

          <Box
            sx={{
              mt: 1.5,
              p: 1,
              borderRadius: 1,
              bgcolor: isBalanced ? 'rgba(22, 163, 74, 0.08)' : 'rgba(220, 38, 38, 0.08)',
              border: `1px solid ${isBalanced ? '#86efac' : '#fca5a5'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontWeight: 800,
                color: isBalanced ? '#15803d' : '#b91c1c',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Partida Doble:
            </Typography>
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 900,
                color: isBalanced ? '#15803d' : '#b91c1c',
                letterSpacing: 0.5,
              }}
            >
              {isBalanced ? '✓ SUMAS IGUALES CUADRADAS' : '⚠ ASIENTO DESCUADRADO'}
            </Typography>
          </Box>
        </Box>

        {/* DESGLOSE DE SUMAS IGUALES */}
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
              p: 1.25,
              borderBottom: '1px solid #cbd5e1',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.85rem',
            }}
          >
            <Typography variant="body2" sx={{ color: '#475569', fontWeight: 700 }}>
              Total Débitos:
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 800, fontFamily: 'monospace' }}>
              {formatCurrencyCop(totalDebit)}
            </Typography>
          </Box>
          <Box
            sx={{
              p: 1.25,
              borderBottom: '1px solid #cbd5e1',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.85rem',
            }}
          >
            <Typography variant="body2" sx={{ color: '#475569', fontWeight: 700 }}>
              Total Créditos:
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 800, fontFamily: 'monospace' }}>
              {formatCurrencyCop(totalCredit)}
            </Typography>
          </Box>
          <Box
            sx={{
              p: 1.25,
              bgcolor: '#0f172a',
              color: '#ffffff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 900, letterSpacing: 0.5 }}>
              SUMAS IGUALES:
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, fontFamily: 'monospace', color: '#ffffff' }}>
              {formatCurrencyCop(totalDebit)}
            </Typography>
          </Box>
        </Box>
      </Box>
    </PrintableDocumentLayout>
  );
};
