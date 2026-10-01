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
  MenuItem,
  CircularProgress,
} from '@mui/material';
import type { CustomerDto, CustomerDocumentType, UpdateCustomerPayload } from '@farmacia/contracts';
import { createCustomer, updateCustomer } from '../api/customers.api';
import { usePermissions } from '../../auth/hooks/usePermissions';

interface CustomerFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  onCustomerCreated?: (created: CustomerDto) => void;
  customerToEdit?: CustomerDto | null;
}

const DOCUMENT_TYPES: Array<{ value: CustomerDocumentType; label: string }> = [
  { value: 'CC', label: 'Cédula de Ciudadanía (CC)' },
  { value: 'NIT', label: 'NIT / Empresa' },
  { value: 'CE', label: 'Cédula de Extranjería (CE)' },
  { value: 'PASAPORTE', label: 'Pasaporte' },
  { value: 'TI', label: 'Tarjeta de Identidad (TI)' },
];

export const CustomerFormDialog: React.FC<CustomerFormDialogProps> = ({
  open,
  onClose,
  onSaved,
  onCustomerCreated,
  customerToEdit,
}) => {
  const isEditing = Boolean(customerToEdit);
  const { isAdmin } = usePermissions();

  const [documentType, setDocumentType] = useState<CustomerDocumentType>('CC');
  const [documentNumber, setDocumentNumber] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (customerToEdit) {
      setDocumentType((customerToEdit.documentType as CustomerDocumentType) || 'CC');
      setDocumentNumber(customerToEdit.documentNumber);
      setName(customerToEdit.name);
      setPhone(customerToEdit.phone || '');
      setEmail(customerToEdit.email || '');
      setAddress(customerToEdit.address || '');
      setIsActive(customerToEdit.isActive);
    } else {
      setDocumentType('CC');
      setDocumentNumber('');
      setName('');
      setPhone('');
      setEmail('');
      setAddress('');
      setIsActive(true);
    }
    setErrorMsg(null);
  }, [customerToEdit, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const docTrimmed = documentNumber.trim();
    const nameTrimmed = name.trim();

    if (!docTrimmed) {
      setErrorMsg('El número de documento es obligatorio.');
      return;
    }
    if (!nameTrimmed) {
      setErrorMsg('El nombre o razón social es obligatorio.');
      return;
    }

    setLoading(true);
    try {
      if (isEditing && customerToEdit) {
        const payload: UpdateCustomerPayload & { documentNumber?: string } = {
          documentType,
          ...(isAdmin ? { documentNumber: docTrimmed } : {}),
          name: nameTrimmed,
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
          isActive,
        };
        const updated = await updateCustomer(customerToEdit.id, payload);
        if (onCustomerCreated) onCustomerCreated(updated);
      } else {
        const created = await createCustomer({
          documentType,
          documentNumber: docTrimmed,
          name: nameTrimmed,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
        });
        if (onCustomerCreated) onCustomerCreated(created);
      }

      if (onSaved) onSaved();
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Ocurrió un error inesperado al guardar el cliente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 600 }}>
          {isEditing ? 'Editar Cliente' : 'Registrar Nuevo Cliente'}
        </DialogTitle>
        <DialogContent dividers>
          {errorMsg && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorMsg}
            </Alert>
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 2fr' }, gap: 2, mb: 2 }}>
            <TextField
              select
              label="Tipo Documento"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as CustomerDocumentType)}
              size="small"
              disabled={loading || (isEditing && customerToEdit?.isDefault)}
            >
              {DOCUMENT_TYPES.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              label="Número de Documento *"
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
              size="small"
              required
              disabled={loading || (isEditing && !isAdmin)}
              placeholder="Ej. 1020304050"
            />
          </Box>

          <TextField
            label="Nombre Completo / Razón Social *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            size="small"
            required
            disabled={loading}
            sx={{ mb: 2 }}
            placeholder="Ej. Juan Pérez"
          />

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 2 }}>
            <TextField
              label="Teléfono / Celular"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              size="small"
              disabled={loading}
              placeholder="Ej. 3001234567"
            />

            <TextField
              label="Correo Electrónico"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              size="small"
              type="email"
              disabled={loading}
              placeholder="cliente@ejemplo.com"
            />
          </Box>

          <TextField
            label="Dirección de Residencia / Domicilio"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            fullWidth
            size="small"
            disabled={loading}
            sx={{ mb: 2 }}
            placeholder="Ej. Calle 10 # 5-20"
          />

          {isEditing && !customerToEdit?.isDefault && (
            <FormControlLabel
              control={
                <Switch
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  color="primary"
                />
              }
              label={isActive ? 'Cliente Activo' : 'Cliente Inactivo'}
            />
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={onClose} disabled={loading} color="inherit">
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
          >
            {isEditing ? 'Guardar Cambios' : 'Registrar Cliente'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
