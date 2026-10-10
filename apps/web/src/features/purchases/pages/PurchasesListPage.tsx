import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { HomeBackButton } from '../../../components/HomeBackButton';
import {
  Box,
  Typography,
  Button,
  TextField,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';
import type { PurchaseDto, SupplierDto } from '@farmacia/contracts';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import { fetchPurchases } from '../api/purchases.api';
import { fetchSuppliers } from '../../suppliers/api/suppliers.api';
import { PurchaseDetailDialog } from '../components/PurchaseDetailDialog';
import { PermissionGate } from '../../auth/components/PermissionGate';
import { DebitNoteDialog } from '../components/DebitNoteDialog';

export const PurchasesListPage: React.FC = () => {
  const [purchases, setPurchases] = useState<PurchaseDto[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [purchaseForDebitNote, setPurchaseForDebitNote] = useState<PurchaseDto | null>(null);

  // Filtros
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [invoiceQuery, setInvoiceQuery] = useState('');

  // Detalle Modal
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseDto | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [purchasesRes, suppliersRes] = await Promise.all([
        fetchPurchases({
          supplierId: selectedSupplierId || undefined,
          invoiceNumber: invoiceQuery.trim() || undefined,
        }),
        fetchSuppliers(),
      ]);
      setPurchases(purchasesRes.items);
      setSuppliers(suppliersRes.items);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al consultar compras.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedSupplierId, invoiceQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenDetail = (purchase: PurchaseDto) => {
    setSelectedPurchase(purchase);
    setDetailOpen(true);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1400, mx: 'auto' }}>
      {/* Encabezado */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <HomeBackButton />
          <Box>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 800, color: 'text.primary' }}>
              Historial de Compras y Abastecimiento
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Consulta y recepción de compras con trazabilidad a proveedores y lotes de inventario.
            </Typography>
          </Box>
        </Box>

        <PermissionGate permission={SYSTEM_PERMISSIONS.PURCHASES_RECEIVE}>
          <Button
            variant="contained"
            color="primary"
            component={Link}
            to="/purchases/receive"
            sx={{
              fontWeight: 700,
              px: 3,
              py: 1,
              textTransform: 'none',
              transition: 'transform 0.1s ease, background-color 0.15s ease',
              '&:active': { transform: 'scale(0.98)' },
            }}
          >
            + Recepcionar Compra
          </Button>
        </PermissionGate>
      </Box>

      {/* Alertas */}
      {errorMsg && (
        <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setErrorMsg(null)}>
          {errorMsg}
        </Alert>
      )}

      {/* Barra de Filtros */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          select
          label="Filtrar por Proveedor"
          value={selectedSupplierId}
          onChange={(e) => setSelectedSupplierId(e.target.value)}
          size="small"
          sx={{ minWidth: 260 }}
        >
          <MenuItem value="">Todos los proveedores</MenuItem>
          {suppliers.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.name}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          label="Buscar por Factura / Comprobante"
          value={invoiceQuery}
          onChange={(e) => setInvoiceQuery(e.target.value)}
          placeholder="Ej. FAC-2026..."
          size="small"
          sx={{ minWidth: 240, flexGrow: 1 }}
        />

        <Button
          variant="outlined"
          onClick={loadData}
          disabled={loading}
          size="medium"
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            transition: 'transform 0.1s ease',
            '&:active': { transform: 'scale(0.98)' },
          }}
        >
          Actualizar
        </Button>
      </Paper>

      {/* Tabla de Compras */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
          <CircularProgress />
        </Box>
      ) : purchases.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: 'center', borderRadius: 2 }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No se encontraron compras registradas
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {selectedSupplierId || invoiceQuery
              ? 'Prueba modificando los filtros de búsqueda.'
              : 'Aún no se han registrado compras a proveedores en el sistema.'}
          </Typography>
          <PermissionGate permission={SYSTEM_PERMISSIONS.PURCHASES_RECEIVE}>
            <Button
              variant="contained"
              component={Link}
              to="/purchases/receive"
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                transition: 'transform 0.1s ease',
                '&:active': { transform: 'scale(0.98)' },
              }}
            >
              Registrar Primera Compra
            </Button>
          </PermissionGate>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table aria-label="Tabla de compras">
            <TableHead sx={{ bgcolor: 'action.hover' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Factura / Comprobante</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Proveedor</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Fecha de Factura</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Total Factura</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>Líneas</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'center' }}>Estado</TableCell>
                <TableCell sx={{ fontWeight: 700, textAlign: 'right' }}>Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {purchases.map((purchase) => (
                <TableRow key={purchase.id} hover>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {purchase.invoiceNumber}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {purchase.supplierName || '—'}
                    </Typography>
                    {purchase.supplierTaxId && (
                      <Typography variant="caption" color="text.secondary">
                        NIT: {purchase.supplierTaxId}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{purchase.purchaseDate}</TableCell>
                  <TableCell sx={{ textAlign: 'right', fontWeight: 800, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
                    ${Number(purchase.totalAmount).toLocaleString()}
                  </TableCell>
                  <TableCell sx={{ textAlign: 'center' }}>
                    <Chip label={`${purchase.lines.length} productos`} size="small" variant="outlined" sx={{ fontWeight: 600 }} />
                  </TableCell>
                  <TableCell sx={{ textAlign: 'center' }}>
                    <Chip
                      label={purchase.status}
                      color="success"
                      size="small"
                      variant="outlined"
                      sx={{
                        fontWeight: 700,
                        bgcolor: 'rgba(46, 125, 50, 0.04)',
                        borderColor: 'rgba(46, 125, 50, 0.4)',
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ textAlign: 'right' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleOpenDetail(purchase)}
                      sx={{
                        textTransform: 'none',
                        fontWeight: 600,
                        transition: 'transform 0.1s ease',
                        '&:active': { transform: 'scale(0.98)' },
                      }}
                    >
                      Ver Detalle
                    </Button>
                    {purchase.status === 'RECEIVED' && (
                      <PermissionGate permission={SYSTEM_PERMISSIONS.PURCHASES_DEBIT_NOTE}>
                        <Button
                          size="small"
                          variant="outlined"
                          color="warning"
                          onClick={() => setPurchaseForDebitNote(purchase)}
                          sx={{ ml: 1, textTransform: 'none', fontWeight: 600 }}
                          data-testid={`debit-note-btn-${purchase.id}`}
                        >
                          Devolución
                        </Button>
                      </PermissionGate>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {successMsg && (
        <Alert severity="success" sx={{ mt: 2 }} onClose={() => setSuccessMsg(null)}>
          {successMsg}
        </Alert>
      )}

      {/* Modal de Detalle */}
      <PurchaseDetailDialog
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        purchase={selectedPurchase}
      />

      {/* Nota Débito / Devolución a proveedor (RF-033) */}
      <DebitNoteDialog
        open={Boolean(purchaseForDebitNote)}
        purchase={purchaseForDebitNote}
        onClose={() => setPurchaseForDebitNote(null)}
        onCreated={(number) => {
          setPurchaseForDebitNote(null);
          setSuccessMsg(`Nota débito ${number} registrada correctamente.`);
          void loadData();
        }}
      />
    </Box>
  );
};
