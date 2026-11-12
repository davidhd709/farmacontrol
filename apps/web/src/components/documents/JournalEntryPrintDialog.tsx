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
import type { JournalEntryDto } from '@farmacia/contracts';
import { PrintableDocumentLayout } from './PrintableDocumentLayout';
import { formatCurrencyCop } from '../../utils/print-document';

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
    `ASI-${entry.id.slice(0, 8).toUpperCase()}`;

  const isManualNote = entry.sourceType === 'MANUAL_NOTE';
  const docTitle = isManualNote ? 'Comprobante / Nota Contable' : 'Asiento del Libro Diario';

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
      actions={actions}
      maxWidth="lg"
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
          <Box sx={{ gridColumn: { xs: '1', sm: '1 / span 2' } }}>
            <Typography variant="caption" color="text.secondary" component="div">
              Concepto / Glosa Contable:
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {entry.description}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" component="div">
              Origen del Asiento:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {entry.sourceType} {entry.sourceDocument ? `(${entry.sourceDocument.number})` : ''}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" component="div">
              Contabilizado / Elaborado por:
            </Typography>
            <Typography variant="body2">
              {entry.createdByName || 'Motor Contable Automático'}
            </Typography>
          </Box>

          {entry.postedAt && (
            <Box>
              <Typography variant="caption" color="text.secondary" component="div">
                Fecha de Contabilización:
              </Typography>
              <Typography variant="body2">{entry.postedAt}</Typography>
            </Box>
          )}

          {entry.reversalReason && (
            <Box sx={{ gridColumn: { xs: '1', sm: '1 / span 2' } }}>
              <Typography variant="caption" color="error.main" component="div" sx={{ fontWeight: 700 }}>
                Motivo de Reversión:
              </Typography>
              <Typography variant="body2" color="error.main">
                {entry.reversalReason}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* DETALLE DE PARTIDAS CONTABLES (LÍNEAS DE ASIENTO) */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          Partidas y Distribución Contable (PUC)
        </Typography>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead sx={{ bgcolor: 'action.hover' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, width: '15%' }}>Código PUC</TableCell>
                <TableCell sx={{ fontWeight: 700, width: '35%' }}>Nombre de Cuenta</TableCell>
                <TableCell sx={{ fontWeight: 700, width: '25%' }}>Tercero / Referencia</TableCell>
                <TableCell sx={{ fontWeight: 700, width: '12.5%' }} align="right">
                  Débito
                </TableCell>
                <TableCell sx={{ fontWeight: 700, width: '12.5%' }} align="right">
                  Crédito
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entry.lines &&
                entry.lines.map((line, idx) => (
                  <TableRow key={line.id || idx}>
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                      {line.accountCode}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 500 }}>{line.accountName}</TableCell>
                    <TableCell>
                      {line.description || '-'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {Number(line.debit) > 0 ? formatCurrencyCop(Number(line.debit)) : '-'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {Number(line.credit) > 0 ? formatCurrencyCop(Number(line.credit)) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* SUMAS IGUALES (PARTIDA DOBLE) */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Box sx={{ width: 360, p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Total Débitos:
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 700 }}>
              {formatCurrencyCop(Number(entry.totalDebit))}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Total Créditos:
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 700 }}>
              {formatCurrencyCop(Number(entry.totalCredit))}
            </Typography>
          </Box>
          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
              ESTADO PARTIDA DOBLE:
            </Typography>
            <Typography
              variant="subtitle2"
              sx={{
                fontWeight: 800,
                color:
                  Number(entry.totalDebit) === Number(entry.totalCredit)
                    ? 'success.main'
                    : 'error.main',
              }}
            >
              {Number(entry.totalDebit) === Number(entry.totalCredit)
                ? 'SUMAS IGUALES CUADRADAS'
                : 'DESCUADRADO'}
            </Typography>
          </Box>
        </Box>
      </Box>
    </PrintableDocumentLayout>
  );
};
