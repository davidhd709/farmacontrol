import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Typography,
  Box,
  TextField,
  MenuItem,
  Chip,
  IconButton,
  Alert,
  CircularProgress,
  Switch,
  FormControlLabel,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import { ExpenseCategoryDto } from '@farmacia/contracts';
import {
  fetchExpenseCategories,
  createExpenseCategory,
  updateExpenseCategory,
  fetchPucAccounts,
} from '../api/expenses.api';
import { AccountDto } from '../../accounting/api/accounting.api';

interface Props {
  open: boolean;
  onClose: () => void;
  onCategoriesChanged?: () => void;
}

export const ExpenseCategoriesModal: React.FC<Props> = ({ open, onClose, onCategoriesChanged }) => {
  const [categories, setCategories] = useState<ExpenseCategoryDto[]>([]);
  const [pucAccounts, setPucAccounts] = useState<AccountDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Formulario de edición / creación
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [accountId, setAccountId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cats, accs] = await Promise.all([
        fetchExpenseCategories(true),
        fetchPucAccounts(),
      ]);
      setCategories(cats);
      // Filtrar cuentas imputables de tipo EXPENSE o COST
      const expenseAccs = accs.filter(
        (a) => (a.type === 'EXPENSE' || a.type === 'COST') && a.allowsMovement && a.isActive,
      );
      setPucAccounts(expenseAccs);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar las categorías o el catálogo de cuentas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const handleOpenCreate = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setAccountId(pucAccounts.length > 0 ? pucAccounts[0].id : '');
    setIsActive(true);
    setFormOpen(true);
    setError(null);
    setSuccess(null);
  };

  const handleOpenEdit = (cat: ExpenseCategoryDto) => {
    setEditingId(cat.id);
    setName(cat.name);
    setDescription(cat.description || '');
    setAccountId(cat.accountId);
    setIsActive(cat.isActive);
    setFormOpen(true);
    setError(null);
    setSuccess(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('El nombre de la categoría es requerido.');
      return;
    }
    if (!accountId) {
      setError('Debe seleccionar una cuenta contable del PUC.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await updateExpenseCategory(editingId, {
          name: name.trim(),
          description: description.trim() || undefined,
          accountId,
          isActive,
        });
        setSuccess('Categoría actualizada exitosamente.');
      } else {
        await createExpenseCategory({
          name: name.trim(),
          description: description.trim() || undefined,
          accountId,
        });
        setSuccess('Categoría creada exitosamente.');
      }
      setFormOpen(false);
      await loadData();
      if (onCategoriesChanged) onCategoriesChanged();
    } catch (err: any) {
      setError(err?.message || 'Error al guardar la categoría.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
          Categorías de Gastos Operativos
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
            {success}
          </Alert>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleOpenCreate}
            size="small"
          >
            Nueva Categoría
          </Button>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={32} />
          </Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: 'action.hover' }}>
                <TableCell sx={{ fontWeight: 'bold' }}>Nombre</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Descripción</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Cuenta Contable (PUC)</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>Estado</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: 'right' }}>Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {categories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} sx={{ textAlign: 'center', py: 3 }}>
                    No hay categorías de gastos configuradas.
                  </TableCell>
                </TableRow>
              ) : (
                categories.map((c) => (
                  <TableRow key={c.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{c.name}</TableCell>
                    <TableCell>{c.description || '—'}</TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                        {c.accountCode}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {c.accountName}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>
                      <Chip
                        label={c.isActive ? 'Activa' : 'Inactiva'}
                        color={c.isActive ? 'success' : 'default'}
                        size="small"
                        variant={c.isActive ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell sx={{ textAlign: 'right' }}>
                      <IconButton size="small" onClick={() => handleOpenEdit(c)} color="primary">
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}

        {/* Modal interno para Crear / Editar Categoría */}
        <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
          <form onSubmit={handleSave}>
            <DialogTitle>
              {editingId ? 'Editar Categoría de Gasto' : 'Nueva Categoría de Gasto'}
            </DialogTitle>
            <DialogContent dividers>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                <TextField
                  label="Nombre de la Categoría"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  fullWidth
                  placeholder="Ej. Servicios Públicos, Papelería, Arriendo"
                  size="small"
                />

                <TextField
                  label="Descripción (Opcional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  fullWidth
                  multiline
                  rows={2}
                  size="small"
                />

                <TextField
                  select
                  label="Cuenta Contable Imputable (PUC)"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  required
                  fullWidth
                  size="small"
                  helperText="Seleccione la cuenta de Gasto o Costo (clase 5 o 6) para la partida doble"
                >
                  {pucAccounts.length === 0 ? (
                    <MenuItem disabled value="">
                      No hay cuentas de gasto imputables activas
                    </MenuItem>
                  ) : (
                    pucAccounts.map((a) => (
                      <MenuItem key={a.id} value={a.id}>
                        {a.code} - {a.name} ({a.type})
                      </MenuItem>
                    ))
                  )}
                </TextField>

                {editingId && (
                  <FormControlLabel
                    control={
                      <Switch
                        checked={isActive}
                        onChange={(e) => setIsActive(e.target.checked)}
                        color="primary"
                      />
                    }
                    label={isActive ? 'Categoría Activa' : 'Categoría Inactiva'}
                  />
                )}
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setFormOpen(false)} color="inherit">
                Cancelar
              </Button>
              <Button type="submit" variant="contained" color="primary" disabled={saving}>
                {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear'}
              </Button>
            </DialogActions>
          </form>
        </Dialog>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="outlined">
          Cerrar
        </Button>
      </DialogActions>
    </Dialog>
  );
};
