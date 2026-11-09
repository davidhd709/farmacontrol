import { useState, type ChangeEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import type { ProductImportPreviewDto } from '@farmacia/contracts';
import {
  confirmProductImport,
  downloadProductTemplate,
  previewProductImport,
} from '../api/products.api';

interface ProductImportDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (count: number) => void;
}

export function ProductImportDialog({ open, onClose, onSuccess }: ProductImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ProductImportPreviewDto | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  const resetState = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    setIsValidating(false);
    setIsConfirming(false);
    setConfirmModalOpen(false);
  };

  const handleClose = () => {
    if (isValidating || isConfirming) return;
    resetState();
    onClose();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setPreview(null);
    setError(null);
  };

  const handleDownloadTemplate = async () => {
    setError(null);
    setIsDownloading(true);
    try {
      await downloadProductTemplate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No fue posible descargar la plantilla.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleValidate = async () => {
    if (!file) return;
    setError(null);
    setPreview(null);
    setIsValidating(true);
    try {
      const result = await previewProductImport(file);
      setPreview(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al validar el archivo Excel.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!file || !preview || preview.errorCount > 0) return;
    setError(null);
    setIsConfirming(true);
    try {
      const result = await confirmProductImport(file, preview.previewHash);
      setConfirmModalOpen(false);
      resetState();
      onSuccess(result.importedCount);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al confirmar la importación.');
      setConfirmModalOpen(false);
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="lg"
        fullWidth
        aria-labelledby="import-products-title"
      >
        <DialogTitle id="import-products-title" sx={{ fontWeight: 800 }}>
          Importar Productos desde Excel (.xlsx)
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <Typography variant="body2" color="text.secondary">
              Carga masiva de productos farmacéuticos y comerciales. Valida la estructura, categorías
              y unicidad antes de confirmar. La importación crea los productos en el catálogo con saldo
              inicial cero y no genera movimientos de inventario ni asientos contables.
            </Typography>

            <Box
              sx={{
                display: 'flex',
                gap: 2,
                flexWrap: 'wrap',
                alignItems: 'center',
                p: 2,
                bgcolor: 'grey.50',
                borderRadius: 2,
                border: '1px dashed',
                borderColor: 'grey.300',
              }}
            >
              <Button
                component="label"
                variant="outlined"
                startIcon={<UploadFileIcon />}
                disabled={isValidating || isConfirming}
              >
                Seleccionar Archivo .xlsx
                <input
                  hidden
                  type="file"
                  accept=".xlsx"
                  onChange={handleFileChange}
                  aria-label="Archivo Excel de productos"
                />
              </Button>

              <Typography variant="body2" sx={{ fontWeight: 500, flex: 1 }}>
                {file ? file.name : 'Ningún archivo seleccionado'}
              </Typography>

              <Button
                variant="text"
                size="small"
                startIcon={<DownloadIcon />}
                onClick={handleDownloadTemplate}
                disabled={isDownloading || isValidating || isConfirming}
              >
                {isDownloading ? 'Descargando…' : 'Descargar plantilla'}
              </Button>
            </Box>

            {file && !preview && (
              <Box>
                <Button
                  variant="contained"
                  onClick={handleValidate}
                  disabled={isValidating}
                  startIcon={isValidating ? <CircularProgress size={16} /> : undefined}
                >
                  {isValidating ? 'Validando archivo…' : 'Validar y Previsualizar'}
                </Button>
              </Box>
            )}

            {error && (
              <Alert severity="error" onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {preview && (
              <Stack spacing={2}>
                <Alert
                  severity={preview.errorCount > 0 ? 'error' : 'success'}
                  icon={preview.errorCount > 0 ? <ErrorOutlineIcon /> : <CheckCircleIcon />}
                >
                  {preview.errorCount > 0
                    ? `Se encontraron errores en ${preview.errorCount} fila(s). Debes corregir el archivo para poder importarlo.`
                    : `${preview.validCount} producto(s) listos para importar sin errores.`}
                </Alert>

                <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap' }}>
                  <Chip
                    label={`Total filas: ${preview.totalRows}`}
                    variant="outlined"
                    size="small"
                  />
                  <Chip
                    label={`Válidos: ${preview.validCount}`}
                    color="success"
                    size="small"
                    icon={<CheckCircleIcon />}
                  />
                  {preview.errorCount > 0 && (
                    <Chip
                      label={`Errores: ${preview.errorCount}`}
                      color="error"
                      size="small"
                      icon={<ErrorOutlineIcon />}
                    />
                  )}
                  {preview.duplicateCount > 0 && (
                    <Chip
                      label={`Duplicados: ${preview.duplicateCount}`}
                      color="warning"
                      size="small"
                      icon={<WarningAmberIcon />}
                    />
                  )}
                </Stack>

                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 380 }}>
                  <Table size="small" stickyHeader aria-label="Vista previa de importación de productos">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'grey.100' }}>
                        <TableCell sx={{ fontWeight: 700 }}>Fila</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Código (SKU)</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Código Barras</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Nombre Comercial</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Categoría</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          Precio Base
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Control Inv.</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Fórmula</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Validación</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {preview.rows.map((row) => (
                        <TableRow
                          key={row.row}
                          hover
                          sx={{
                            bgcolor: row.errors.length > 0 ? 'error.50' : undefined,
                          }}
                        >
                          <TableCell>{row.row}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                            {row.code || '—'}
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'monospace' }}>
                            {row.barcode || '—'}
                          </TableCell>
                          <TableCell>{row.name || '—'}</TableCell>
                          <TableCell>{row.categoryName || '—'}</TableCell>
                          <TableCell align="right">
                            ${Number(row.basePrice).toLocaleString('es-CO', { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell>{row.inventoryControlMode}</TableCell>
                          <TableCell>{row.prescriptionRequired ? 'SI' : 'NO'}</TableCell>
                          <TableCell>
                            {row.errors.length > 0 ? (
                              <Typography variant="caption" color="error.main" sx={{ fontWeight: 600 }}>
                                {row.errors.join(' | ')}
                              </Typography>
                            ) : (
                              <Chip size="small" label="Válido" color="success" variant="outlined" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleClose} disabled={isValidating || isConfirming}>
            Cancelar
          </Button>
          {preview && preview.errorCount === 0 && (
            <Button
              variant="contained"
              color="primary"
              onClick={() => setConfirmModalOpen(true)}
              disabled={isConfirming || isValidating}
            >
              Confirmar Importación ({preview.validCount} productos)
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Modal de confirmación final */}
      <Dialog
        open={confirmModalOpen}
        onClose={isConfirming ? undefined : () => setConfirmModalOpen(false)}
        aria-labelledby="confirm-import-products-dialog-title"
      >
        <DialogTitle id="confirm-import-products-dialog-title" sx={{ fontWeight: 700 }}>
          ¿Confirmar importación de {preview?.validCount ?? 0} productos?
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Se registrarán <strong>{preview?.validCount ?? 0}</strong> productos nuevos en el catálogo
            con existencia inicial en cero. Esta acción es segura y no genera movimientos de inventario ni
            asientos contables.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmModalOpen(false)} disabled={isConfirming}>
            Volver
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleConfirmImport}
            disabled={isConfirming}
            startIcon={isConfirming ? <CircularProgress size={16} /> : undefined}
          >
            {isConfirming ? 'Importando…' : 'Sí, Importar Productos'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
