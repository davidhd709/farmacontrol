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
import type { ExpenseDto } from '@farmacia/contracts';
import { PrintableDocumentLayout } from './PrintableDocumentLayout';
import { formatCurrencyCop } from '../../utils/print-document';

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
              Beneficiario / Proveedor:
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 700 }}>
              {expense.beneficiary} {expense.supplierName ? `(${expense.supplierName})` : ''}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" component="div">
              Categoría de Gasto:
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {expense.categoryName}
            </Typography>
          </Box>

          <Box sx={{ gridColumn: { xs: '1', sm: '1 / span 2' } }}>
            <Typography variant="caption" color="text.secondary" component="div">
              Cuenta Contable Afectada:
            </Typography>
            <Typography variant="body2">
              <strong>{expense.accountCode}</strong> — {expense.accountName}
            </Typography>
          </Box>

          <Box sx={{ gridColumn: { xs: '1', sm: '1 / span 2' } }}>
            <Typography variant="caption" color="text.secondary" component="div">
              Descripción / Concepto del Gasto:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {expense.description}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" component="div">
              Medio de Pago / Cuenta:
            </Typography>
            <Typography variant="body2">
              {expense.paymentMethod}{' '}
              {expense.bankAccountName ? `— ${expense.bankAccountName}` : ''}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" component="div">
              Vencimiento:
            </Typography>
            <Typography variant="body2">
              {expense.dueDate ? expense.dueDate : 'Inmediato'}
            </Typography>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" component="div">
              Registrado por:
            </Typography>
            <Typography variant="body2">
              {expense.createdByName || 'Usuario del sistema'}
            </Typography>
          </Box>

          {expense.notes && (
            <Box sx={{ gridColumn: { xs: '1', sm: '1 / span 2' } }}>
              <Typography variant="caption" color="text.secondary" component="div">
                Notas adicionales:
              </Typography>
              <Typography variant="body2">{expense.notes}</Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* HISTORIAL DE PAGOS APLICADOS */}
      {expense.payments && expense.payments.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Comprobantes de Pago Realizados
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead sx={{ bgcolor: 'action.hover' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Fecha Pago</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Medio</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">
                    Valor Pagado
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="center">
                    Estado
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {expense.payments.map((p, idx) => (
                  <TableRow key={p.id || idx}>
                    <TableCell>{p.paymentDate}</TableCell>
                    <TableCell>{p.paymentMethod}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {formatCurrencyCop(Number(p.amount))}
                    </TableCell>
                    <TableCell align="center">
                      {p.isReversed ? (
                        <Typography variant="caption" color="error.main" sx={{ fontWeight: 700 }}>
                          REVERTIDO
                        </Typography>
                      ) : (
                        <Typography variant="caption" color="success.main" sx={{ fontWeight: 700 }}>
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

      <Divider sx={{ my: 2 }} />

      {/* TOTALES */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Box sx={{ width: 280, p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Importe Total:
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 700 }}>
              {formatCurrencyCop(Number(expense.amount))}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              Abonado / Pagado:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.main' }}>
              {formatCurrencyCop(Number(expense.amountPaid))}
            </Typography>
          </Box>
          <Divider sx={{ my: 1 }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              SALDO PENDIENTE:
            </Typography>
            <Typography variant="h6" color="primary.main" sx={{ fontWeight: 800 }}>
              {formatCurrencyCop(Number(expense.balance))}
            </Typography>
          </Box>
        </Box>
      </Box>
    </PrintableDocumentLayout>
  );
};
