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
import type { TreasuryDocumentDto } from '@farmacia/contracts';
import { PrintableDocumentLayout } from './PrintableDocumentLayout';
import { formatCurrencyCop } from '../../utils/print-document';

interface Props {
  open: boolean;
  document: TreasuryDocumentDto | null;
  onClose: () => void;
  actions?: React.ReactNode;
}

export const TreasuryDocumentPrintDialog: React.FC<Props> = ({
  open,
  document,
  onClose,
  actions,
}) => {
  if (!document) return null;

  const isReceipt = document.documentType === 'RECIBO_CAJA';
  const docTypeName = isReceipt ? 'Recibo de caja' : 'Comprobante de egreso';
  const thirdPartyName =
    document.thirdPartyName ||
    'No especificado';

  return (
    <PrintableDocumentLayout
      open={open}
      onClose={onClose}
      documentType={docTypeName}
      documentNumber={document.documentNumber}
      documentDate={document.documentDate}
      status={document.status}
      cancelledAt={document.cancelledAt}
      cancelledByName={document.cancelledByName}
      cancellationReason={document.cancellationReason}
      actions={actions}
      maxWidth="md"
    >
      {/* DATOS DE LA OPERACIÓN */}
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
              {isReceipt ? 'Recibido de (Cliente / Tercero):' : 'Pagado a (Proveedor / Beneficiario):'}
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 700 }}>
              {thirdPartyName}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" component="div">
              Medio de pago / Cuenta:
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {document.paymentMethod}{' '}
              {document.bankAccountName ? `— ${document.bankAccountName}` : ''}
            </Typography>
          </Box>

          <Box sx={{ gridColumn: { xs: '1', sm: '1 / span 2' } }}>
            <Typography variant="caption" color="text.secondary" component="div">
              Concepto:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {document.concept}
            </Typography>
          </Box>

          {document.counterpartAccount && (
            <Box sx={{ gridColumn: { xs: '1', sm: '1 / span 2' } }}>
              <Typography variant="caption" color="text.secondary" component="div">
                Contrapartida contable:
              </Typography>
              <Typography variant="body2">
                <strong>{document.counterpartAccount}</strong>
              </Typography>
            </Box>
          )}

          <Box>
            <Typography variant="caption" color="text.secondary" component="div">
              Registrado por:
            </Typography>
            <Typography variant="body2">
              {document.createdByName || 'Sistema'}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" component="div">
              Origen:
            </Typography>
            <Typography variant="body2">
              {document.origin}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* DETALLE DE FACTURAS APLICADAS (SI APLICA) */}
      {document.applications && document.applications.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            {isReceipt ? 'Facturas de Venta Abonadas' : 'Facturas o Gastos Pagados'}
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead sx={{ bgcolor: 'action.hover' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Documento Relacionado</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">
                    Valor Aplicado
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">
                    Estado Abono
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {document.applications.map((app, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      {app.documentNumber}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {formatCurrencyCop(Number(app.amount))}
                    </TableCell>
                    <TableCell align="center">
                      {app.isReversed ? (
                        <Typography variant="caption" color="error.main" sx={{ fontWeight: 700 }}>
                          REVERTIDO
                        </Typography>
                      ) : (
                        <Typography variant="caption" color="success.main" sx={{ fontWeight: 700 }}>
                          APLICADO
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      <Divider sx={{ my: 2 }} />

      {/* TOTAL DOCUMENTO */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mb: 2 }}>
        <Box sx={{ textAlign: 'right', minWidth: 260, p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
          <Typography variant="caption" color="text.secondary" component="div">
            VALOR TOTAL ({isReceipt ? 'INGRESADO' : 'EGRESADO'})
          </Typography>
          <Typography variant="h5" color="primary.main" sx={{ fontWeight: 800 }}>
            {formatCurrencyCop(Number(document.amount))}
          </Typography>
        </Box>
      </Box>
    </PrintableDocumentLayout>
  );
};
