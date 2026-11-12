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
import type { TreasuryDocumentDto } from '@farmacia/contracts';
import { PrintableDocumentLayout } from './PrintableDocumentLayout';
import { formatCurrencyCop } from '../../utils/print-document';
import { numberToWordsCop } from '../../utils/number-to-words';

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
  const thirdPartyName = document.thirdPartyName || 'No especificado';
  const amountNum = Number(document.amount) || 0;

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
      createdByName={document.createdByName}
      recipientLabel={
        isReceipt
          ? 'Firma y Cédula de Quien Entrega / Recaudador'
          : 'Firma y Cédula Beneficiario (Recibí Conforme)'
      }
      actions={actions}
      maxWidth="md"
    >
      {/* CUADÍCULA FORMAL CONTABLE DEL TERCERO Y OPERACIÓN */}
      <Box sx={{ mb: 2.5 }}>
        <Box
          sx={{
            border: '1px solid #334155',
            borderRadius: 1,
            overflow: 'hidden',
          }}
        >
          {/* FILA 1: TERCERO Y MEDIO DE PAGO */}
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
                {isReceipt ? 'Recibido de (Cliente / Tercero):' : 'Pagado a (Proveedor / Beneficiario):'}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 800, color: '#0f172a', mt: 0.25 }}>
                {thirdPartyName}
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
                Medio de pago / Cuenta auxiliar:
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a', mt: 0.25 }}>
                {document.paymentMethod}{' '}
                {document.bankAccountName ? `— ${document.bankAccountName}` : '— Caja General'}
              </Typography>
            </Box>
          </Box>

          {/* FILA 2: CONCEPTO DE LA OPERACIÓN */}
          <Box sx={{ p: 1.5, borderBottom: document.counterpartAccount ? '1px solid #cbd5e1' : 'none' }}>
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
              Por concepto de:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b', mt: 0.25 }}>
              {document.concept}
            </Typography>
          </Box>

          {/* FILA 3 (OPCIONAL): CONTRAPARTIDA CONTABLE */}
          {document.counterpartAccount && (
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
                Contrapartida contable imputada:
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>
                {document.counterpartAccount}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* DETALLE DE FACTURAS APLICADAS EN FORMATO CONTABLE */}
      {document.applications && document.applications.length > 0 && (
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
            {isReceipt ? 'Relación de Facturas de Venta Abonadas' : 'Relación de Facturas de Compra / Gastos Pagados'}
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
                    Documento Relacionado
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1 }}>
                    Valor Aplicado
                  </TableCell>
                  <TableCell align="center" sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1 }}>
                    Estado Abono
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {document.applications.map((app, idx) => (
                  <TableRow
                    key={idx}
                    sx={{
                      bgcolor: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                      '& td': { borderBottom: '1px solid #e2e8f0', py: 0.75 },
                    }}
                  >
                    <TableCell sx={{ fontWeight: 700, color: '#0f172a' }}>
                      {app.documentNumber}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                      {formatCurrencyCop(Number(app.amount))}
                    </TableCell>
                    <TableCell align="center">
                      <Typography
                        variant="caption"
                        sx={{
                          fontWeight: 800,
                          fontSize: '0.7rem',
                          color: app.isReversed ? '#b91c1c' : '#15803d',
                        }}
                      >
                        {app.isReversed ? 'REVERTIDO' : 'APLICADO'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* SECCIÓN DE TOTALES Y VALOR EN LETRAS */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1.4fr 1fr' },
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
            SON: {numberToWordsCop(amountNum)}
          </Typography>
        </Box>

        {/* VALOR TOTAL MONETARIO */}
        <Box
          sx={{
            border: '2px solid #0f172a',
            borderRadius: 1,
            overflow: 'hidden',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box sx={{ bgcolor: '#0f172a', color: '#ffffff', py: 0.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>
              VALOR TOTAL ({isReceipt ? 'RECIBIDO' : 'PAGADO'})
            </Typography>
          </Box>
          <Box sx={{ py: 1, px: 1.5, bgcolor: '#ffffff', flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="h5" sx={{ fontWeight: 900, color: '#0f172a', fontFamily: 'monospace' }}>
              {formatCurrencyCop(amountNum)}
            </Typography>
          </Box>
        </Box>
      </Box>
    </PrintableDocumentLayout>
  );
};
