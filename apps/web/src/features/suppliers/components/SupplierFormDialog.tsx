import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControlLabel,
  Switch,
  Alert,
  Box,
  Typography,
} from '@mui/material';
import type { SupplierDto, CreateSupplierPayload, UpdateSupplierPayload } from '@farmacia/contracts';
import { createSupplier, updateSupplier } from '../api/suppliers.api';

interface SupplierFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  supplierToEdit?: SupplierDto | null;
}

export const SupplierFormDialog: React.FC<SupplierFormDialogProps> = ({
  open,
  onClose,
  onSaved,
  supplierToEdit,
}) => {
  const isEditing = Boolean(supplierToEdit);

  const [taxId, setTaxId] = useState('');
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (supplierToEdit) {
      setTaxId(supplierToEdit.taxId);
      setName(supplierToEdit.name);
      setContactName(supplierToEdit.contactName || '');
      setPhone(supplierToEdit.phone || '');
      setEmail(supplierToEdit.email || '');
      setAddress(supplierToEdit.address || '');
      setIsActive(supplierToEdit.isActive);
    } else {
      setTaxId('');
      setName('');
      setContactName('');
      setPhone('');
      setEmail('');
      setAddress('');
      setIsActive(true);
    }
    setErrorMsg(null);
  }, [supplierToEdit, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!taxId.trim()) {
      setErrorMsg('El NIT o documento de identificación es obligatorio.');
      return;
    }
    if (!name.trim()) {
      setErrorMsg('La razón social o nombre comercial es obligatorio.');
      return;
    }

    if (email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        setErrorMsg('El correo electrónico ingresado no tiene un formato válido.');
        return;
      }
    }

    setLoading(true);
    try {
      if (isEditing && supplierToEdit) {
        const payload: UpdateSupplierPayload = {
          taxId: taxId.trim(),
          name: name.trim(),
          contactName: contactName.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
          isActive,
        };
        await updateSupplier(supplierToEdit.id, payload);
      } else {
        const payload: CreateSupplierPayload = {
          taxId: taxId.trim(),
          name: name.trim(),
          contactName: contactName.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
        };
        await createSupplier(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar el proveedor.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 'bold' }}>
          {isEditing ? 'Editar Proveedor' : 'Registrar Nuevo Proveedor'}
        </DialogTitle>

        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
            {errorMsg && (
              <Alert severity="error" role="alert">
                {errorMsg}
              </Alert>
            )}

            <Typography variant="body2" color="text.secondary">
              Ingresa la información fiscal y comercial del proveedor. Los campos marcados con (*) son obligatorios.
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
              <TextField
                label="NIT / Identificación Fiscal *"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="Ej. 900123456-1"
                required
                fullWidth
                disabled={loading}
                autoFocus
              />
              <TextField
                label="Teléfono"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ej. +57 300 123 4567"
                fullWidth
                disabled={loading}
              />
            </Box>

            <TextField
              label="Razón Social / Nombre Comercial *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Distribuidora Farmacéutica del Valle S.A.S."
              required
              fullWidth
              disabled={loading}
            />

            <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
              <TextField
                label="Nombre de Contacto"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Ej. Carlos Gómez (Asesor Comercial)"
                fullWidth
                disabled={loading}
              />
              <TextField
                label="Correo Electrónico"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ventas@proveedor.com"
                fullWidth
                disabled={loading}
              />
            </Box>

            <TextField
              label="Dirección Física"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ej. Calle 10 # 45-20, Bogotá"
              fullWidth
              disabled={loading}
            />

            {isEditing && (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                    Estado del Proveedor
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {isActive ? 'El proveedor está habilitado para registrar compras' : 'El proveedor está inactivado'}
                  </Typography>
                </Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      color="primary"
                      disabled={loading}
                    />
                  }
                  label={isActive ? 'Activo' : 'Inactivo'}
                  sx={{ m: 0 }}
                />
              </Box>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={onClose} disabled={loading} color="inherit">
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            sx={{ fontWeight: 'bold' }}
          >
            {loading ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Registrar Proveedor'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
