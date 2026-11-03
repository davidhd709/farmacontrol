import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableContainer,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExpenseWithoutSupplierDto, ThirdPartyDto } from '@farmacia/contracts';
import { assignExpenseSupplier, fetchExpensesWithoutSupplier } from '../api/expenses.api';
import { ThirdPartyAutocomplete } from '../../third-parties/components/ThirdPartyAutocomplete';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { formatDate } from '../../../utils/date-format';
import { DateField } from '../../../components/DateField';

const money = (value: string) =>
  `$${Number(value).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Causaciones sin proveedor (anteriores a que fuera obligatorio): no aparecen en ningún estado
 * de cuenta ni se pueden pagar con un comprobante de egreso. Se asigna el proveedor a mano; la
 * asignación queda en auditoría.
 */
export function ExpensesWithoutSupplierDialog({
  canAssign,
  onClose,
}: {
  canAssign: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selected, setSelected] = useState<ExpenseWithoutSupplierDto | null>(null);
  const [supplier, setSupplier] = useState<ThirdPartyDto | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['expenses-without-supplier', fromDate, toDate],
    queryFn: () =>
      fetchExpensesWithoutSupplier({
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      }),
  });
  const assign = useMutation({
    mutationFn: () => assignExpenseSupplier(selected!.id, supplier!.supplierId!),
    onSuccess: (expense) => {
      setDone(`Proveedor ${expense.supplierName} asignado a "${expense.description}".`);
      setSelected(null);
      setSupplier(null);
      for (const key of ['expenses-without-supplier', 'expenses', 'payables-statement']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
    onSettled: () => setConfirming(false),
  });
  const total = (list.data ?? []).reduce((acc, e) => acc + Number(e.balance), 0);

  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth aria-labelledby="no-supplier-title">
      <DialogTitle id="no-supplier-title" sx={{ fontWeight: 700 }}>
        Causaciones sin proveedor
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            No aparecen en el estado de cuenta de ningún proveedor ni se pueden pagar con un
            comprobante de egreso hasta asignarles uno.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <DateField
              label="Desde"
              size="small"
              value={fromDate}
              onChange={(value) => setFromDate(value)}
            />
            <DateField
              label="Hasta"
              size="small"
              value={toDate}
              onChange={(value) => setToDate(value)}
            />
          </Stack>
          {done && (
            <Alert severity="success" onClose={() => setDone(null)}>
              {done}
            </Alert>
          )}
          {assign.isError && <Alert severity="error">{(assign.error as Error).message}</Alert>}
          {list.isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
              <CircularProgress size={28} />
            </Box>
          ) : list.isError ? (
            <Alert severity="error">{(list.error as Error).message}</Alert>
          ) : !list.data?.length ? (
            <Alert severity="success" variant="outlined">
              Todas las causaciones tienen proveedor.
            </Alert>
          ) : (
            <>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {list.data.length} causación(es) · saldo pendiente {money(String(total))}
              </Typography>
              <TableContainer>
                <Table size="small" aria-label="Causaciones sin proveedor">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Fecha</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Concepto</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Beneficiario registrado</TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">
                        Valor
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700 }} align="right">
                        Saldo
                      </TableCell>
                      {canAssign && <TableCell />}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {list.data.map((e) => (
                      <TableRow key={e.id} selected={selected?.id === e.id}>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(e.expenseDate)}</TableCell>
                        <TableCell>
                          {e.description}
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: 'block' }}
                          >
                            {e.categoryName}
                            {e.documentNumber ? ` · ${e.documentNumber}` : ''}
                          </Typography>
                        </TableCell>
                        <TableCell>{e.beneficiary}</TableCell>
                        <TableCell align="right">{money(e.amount)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          {money(e.balance)}
                        </TableCell>
                        {canAssign && (
                          <TableCell align="right">
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => {
                                setSelected(e);
                                setSupplier(null);
                              }}
                            >
                              Asignar proveedor
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
          {selected && (
            <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                Proveedor para "{selected.description}" (registrada a nombre de{' '}
                {selected.beneficiary})
              </Typography>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1.5}
                sx={{ alignItems: { sm: 'flex-start' } }}
              >
                <ThirdPartyAutocomplete
                  value={supplier}
                  onChange={setSupplier}
                  role="SUPPLIER"
                  label="Proveedor"
                  showQuickCreate={false}
                  error={Boolean(supplier && !supplier.supplierId)}
                  helperText={
                    supplier && !supplier.supplierId
                      ? 'El tercero no está registrado como proveedor.'
                      : undefined
                  }
                />
                <Button
                  variant="contained"
                  disabled={!supplier?.supplierId || assign.isPending}
                  onClick={() => setConfirming(true)}
                  sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  Asignar
                </Button>
              </Stack>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>
          Cerrar
        </Button>
      </DialogActions>
      <ConfirmDialog
        open={confirming}
        title="Confirmar proveedor"
        description={`La causación "${selected?.description ?? ''}" quedará a nombre de ${supplier?.name ?? ''} y aparecerá en su estado de cuenta. La asignación no se puede cambiar después y queda en auditoría.`}
        confirmText="Asignar"
        isLoading={assign.isPending}
        onConfirm={() => assign.mutate()}
        onClose={() => setConfirming(false)}
      />
    </Dialog>
  );
}
