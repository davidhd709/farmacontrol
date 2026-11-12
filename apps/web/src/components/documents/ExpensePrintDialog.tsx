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
import type { ExpenseDto } from '@farmacia/contracts';
import { PrintableDocumentLayout } from './PrintableDocumentLayout';
import { formatCurrencyCop } from '../../utils/print-document';
import { numberToWordsCop } from '../../utils/number-to-words';

interface Props {
  open: boolean;
  expense: ExpenseDto | null;
  onClose: () => void;
  actions?: React.ReactNode;
}

export const ExpensePrintDialog: React.FC<Props> = ({
  open,
  expense,
  onClose,
  actions,
}) => {
  if (!expense) return null;

  const docNumber = expense.documentNumber || `GAS-${expense.id.slice(0, 8).toUpperCase()}`;
  const totalNum = Number(expense.amount) || 0;

  return (
    <PrintableDocumentLayout
      open={open}
      onClose={onClose}
      documentType="Causación de Gasto Operativo"
      documentNumber={docNumber}
      documentDate={expense.expenseDate || expense.createdAt}
      status={expense.status}
      isCancelled={expense.status === 'ANULADO'}
      cancelledAt={expense.cancelledAt}
      cancelledByName={expense.cancelledByName}
      cancellationReason={expense.cancellationReason}
      createdByName={expense.createdByName}
      recipientLabel="Firma y Cédula Beneficiario"
      actions={actions}
      maxWidth="md"
    >
      {/* CUADRÍCULA FORMAL DEL GASTO */}
      <Box sx={{ mb: 2.5 }}>
        <Box
          sx={{
            border: '1px solid #334155',
            borderRadius: 1,
            overflow: 'hidden',
          }}
        >
          {/* FILA 1: BENEFICIARIO Y CATEGORÍA */}
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
                Beneficiario / Proveedor:
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 800, color: '#0f172a', mt: 0.25 }}>
                {expense.beneficiary} {expense.supplierName ? `(${expense.supplierName})` : ''}
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
                Categoría del Gasto:
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 800, color: '#0f172a', mt: 0.25 }}>
                {expense.categoryName || 'General'}
              </Typography>
            </Box>
          </Box>

          {/* FILA 2: CUENTA CONTABLE Y CONCEPTO */}
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
                Descripción / Glosa del Gasto:
              </Typography>
              <Typography variant="body2" sx={{ color: '#1e293b', fontWeight: 600, mt: 0.25 }}>
                {expense.description}
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
                Cuenta Contable PUC Afectada:
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontWeight: 700, color: '#0f172a', fontFamily: 'monospace', mt: 0.25 }}
              >
                {expense.accountCode ? `${expense.accountCode} — ${expense.accountName || ''}` : 'No parametrizada'}
              </Typography>
            </Box>
          </Box>

          {/* FILA 3: CONDICIONES DE PAGO Y REGISTRADO POR */}
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
                Medio de Pago / Cuenta:
              </Typography>
              <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 600, mt: 0.25 }}>
                {expense.paymentMethod || 'No especificado'}{' '}
                {expense.bankAccountName ? `— ${expense.bankAccountName}` : ''}
                {expense.dueDate ? ` (Vence: ${expense.dueDate})` : ''}
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
                {expense.createdByName || 'Usuario del sistema'}
              </Typography>
            </Box>
          </Box>

          {expense.notes && (
            <Box sx={{ p: 1.5, borderTop: '1px solid #cbd5e1', bgcolor: '#ffffff' }}>
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
                Notas Adicionales:
              </Typography>
              <Typography variant="body2" sx={{ color: '#334155', mt: 0.25 }}>
                {expense.notes}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* HISTORIAL DE COMPROBANTES DE PAGO REALIZADOS */}
      {expense.payments && expense.payments.length > 0 && (
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
            Historial de Comprobantes de Pago Realizados a este Gasto
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
                    Fecha Pago
                  </TableCell>
                  <TableCell sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1 }}>
                    Medio de Pago
                  </TableCell>
                  <TableCell align="right" sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1 }}>
                    Valor Pagado
                  </TableCell>
                  <TableCell align="center" sx={{ color: '#ffffff', fontWeight: 800, fontSize: '0.75rem', py: 1 }}>
                    Estado
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {expense.payments.map((p, idx) => (
                  <TableRow
                    key={p.id || idx}
                    sx={{
                      bgcolor: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                      '& td': { borderBottom: '1px solid #e2e8f0', py: 0.75 },
                    }}
                  >
                    <TableCell>{p.paymentDate}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{p.paymentMethod}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, fontFamily: 'monospace' }}>
                      {formatCurrencyCop(Number(p.amount))}
                    </TableCell>
                    <TableCell align="center">
                      {p.isReversed ? (
                        <Typography variant="caption" sx={{ color: '#dc2626', fontWeight: 800 }}>
                          REVERTIDO
                        </Typography>
                      ) : (
                        <Typography variant="caption" sx={{ color: '#16a34a', fontWeight: 800 }}>
                          PAGADO
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
            Importe del Gasto en Letras:
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
              Importe Total Causado:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: 'monospace' }}>
              {formatCurrencyCop(Number(expense.amount))}
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
              Abonado / Pagado:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 800, fontFamily: 'monospace', color: '#16a34a' }}>
              {formatCurrencyCop(Number(expense.amountPaid))}
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
              SALDO PENDIENTE:
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, fontFamily: 'monospace', color: '#ffffff' }}>
              {formatCurrencyCop(Number(expense.balance))}
            </Typography>
          </Box>
        </Box>
      </Box>
    </PrintableDocumentLayout>
  );
};
