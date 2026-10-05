import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControlLabel,
  Checkbox,
  Alert,
  Box,
  MenuItem,
  CircularProgress,
  Grid,
  Typography,
  Divider,
} from '@mui/material';
import type {
  ThirdPartyDto,
  ThirdPartyDocumentType,
  ThirdPartyPersonType,
  ThirdPartyTaxRegime,
  CreateThirdPartyPayload,
  UpdateThirdPartyPayload,
} from '@farmacia/contracts';
import { createThirdParty, updateThirdParty } from '../api/third-parties.api';

interface ThirdPartyFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  thirdPartyToEdit?: ThirdPartyDto | null;
}

const DOCUMENT_TYPES: Array<{ value: ThirdPartyDocumentType; label: string }> = [
  { value: 'NIT', label: 'NIT — Número de Identificación Tributaria' },
  { value: 'CC', label: 'CC — Cédula de Ciudadanía' },
  { value: 'CE', label: 'CE — Cédula de Extranjería' },
  { value: 'TI', label: 'TI — Tarjeta de Identidad' },
  { value: 'PASAPORTE', label: 'Pasaporte' },
  { value: 'RUT', label: 'RUT' },
];

const TAX_REGIMES: Array<{ value: ThirdPartyTaxRegime; label: string }> = [
  { value: 'NO_RESPONSABLE_IVA', label: 'No Responsable de IVA' },
  { value: 'RESPONSABLE_IVA', label: 'Responsable de IVA' },
  { value: 'REGIMEN_SIMPLE', label: 'Régimen Simple de Tributación (RST)' },
  { value: 'GRAN_CONTRIBUYENTE', label: 'Gran Contribuyente' },
  { value: 'AUTORRETENEDOR', label: 'Autorretenedor' },
];

// Cálculo automático de Dígito de Verificación DIAN
function calculateDv(nit: string): string {
  const clean = nit.replace(/\D/g, '');
  if (!clean) return '';
  const weights = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  let sum = 0;
  for (let i = 0; i < clean.length; i++) {
    const digit = parseInt(clean.charAt(clean.length - 1 - i), 10);
    sum += digit * (weights[i] || 0);
  }
  const mod = sum % 11;
  if (mod === 0 || mod === 1) return String(mod);
  return String(11 - mod);
}

export const ThirdPartyFormDialog: React.FC<ThirdPartyFormDialogProps> = ({
  open,
  onClose,
  onSaved,
  thirdPartyToEdit,
}) => {
  const isEditing = Boolean(thirdPartyToEdit);

  const [personType, setPersonType] = useState<ThirdPartyPersonType>('NATURAL');
  const [documentType, setDocumentType] = useState<ThirdPartyDocumentType>('CC');
  const [documentNumber, setDocumentNumber] = useState('');
  const [verificationDigit, setVerificationDigit] = useState('');
  const [name, setName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [department, setDepartment] = useState('');
  const [taxRegime, setTaxRegime] = useState<ThirdPartyTaxRegime>('NO_RESPONSABLE_IVA');

  // Roles
  const [isCustomer, setIsCustomer] = useState(false);
  const [isSupplier, setIsSupplier] = useState(false);
  const [isEmployee, setIsEmployee] = useState(false);
  const [isOther, setIsOther] = useState(false);

  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (thirdPartyToEdit) {
      setPersonType((thirdPartyToEdit.personType as ThirdPartyPersonType) || 'NATURAL');
      setDocumentType((thirdPartyToEdit.documentType as ThirdPartyDocumentType) || 'CC');
      setDocumentNumber(thirdPartyToEdit.documentNumber);
      setVerificationDigit(thirdPartyToEdit.verificationDigit || '');
      setName(thirdPartyToEdit.name);
      setTradeName(thirdPartyToEdit.tradeName || '');
      setContactName(thirdPartyToEdit.contactName || '');
      setPhone(thirdPartyToEdit.phone || '');
      setEmail(thirdPartyToEdit.email || '');
      setAddress(thirdPartyToEdit.address || '');
      setCity(thirdPartyToEdit.city || '');
      setDepartment(thirdPartyToEdit.department || '');
      setTaxRegime((thirdPartyToEdit.taxRegime as ThirdPartyTaxRegime) || 'NO_RESPONSABLE_IVA');
      setIsCustomer(thirdPartyToEdit.isCustomer);
      setIsSupplier(thirdPartyToEdit.isSupplier);
      setIsEmployee(thirdPartyToEdit.isEmployee);
      setIsOther(thirdPartyToEdit.isOther);
      setNotes(thirdPartyToEdit.notes || '');
    } else {
      setPersonType('NATURAL');
      setDocumentType('CC');
      setDocumentNumber('');
      setVerificationDigit('');
      setName('');
      setTradeName('');
      setContactName('');
      setPhone('');
      setEmail('');
      setAddress('');
      setCity('');
      setDepartment('');
      setTaxRegime('NO_RESPONSABLE_IVA');
      setIsCustomer(true);
      setIsSupplier(false);
      setIsEmployee(false);
      setIsOther(false);
      setNotes('');
    }
    setErrorMsg(null);
  }, [thirdPartyToEdit, open]);

  // Recalcular DV automáticamente cuando cambia NIT
  const handleDocumentNumberChange = (val: string) => {
    setDocumentNumber(val);
    if (documentType === 'NIT') {
      const dv = calculateDv(val);
      setVerificationDigit(dv);
    }
  };

  const handleDocumentTypeChange = (type: ThirdPartyDocumentType) => {
    setDocumentType(type);
    if (type === 'NIT') {
      setPersonType('JURIDICA');
      setVerificationDigit(calculateDv(documentNumber));
    } else {
      setPersonType('NATURAL');
      setVerificationDigit('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedDoc = documentNumber.trim();
    const trimmedName = name.trim();

    if (!trimmedDoc) {
      setErrorMsg('El número de documento es obligatorio.');
      return;
    }
    if (!trimmedName) {
      setErrorMsg('El nombre o razón social es obligatorio.');
      return;
    }
    if (!isCustomer && !isSupplier && !isEmployee && !isOther) {
      setErrorMsg('Debe seleccionar al menos un rol para el tercero (Cliente, Proveedor, Empleado u Otro).');
      return;
    }

    setLoading(true);

    try {
      if (isEditing && thirdPartyToEdit) {
        const updatePayload: UpdateThirdPartyPayload = {
          personType,
          documentType,
          verificationDigit: verificationDigit.trim() || null,
          name: trimmedName,
          tradeName: tradeName.trim() || null,
          contactName: contactName.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
          city: city.trim() || null,
          department: department.trim() || null,
          taxRegime,
          isCustomer,
          isSupplier,
          isEmployee,
          isOther,
          notes: notes.trim() || null,
        };
        await updateThirdParty(thirdPartyToEdit.id, updatePayload);
      } else {
        const createPayload: CreateThirdPartyPayload = {
          personType,
          documentType,
          documentNumber: trimmedDoc,
          verificationDigit: verificationDigit.trim() || null,
          name: trimmedName,
          tradeName: tradeName.trim() || null,
          contactName: contactName.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
          city: city.trim() || null,
          department: department.trim() || null,
          taxRegime,
          isCustomer,
          isSupplier,
          isEmployee,
          isOther,
          notes: notes.trim() || null,
        };
        await createThirdParty(createPayload);
      }

      onClose();
      if (onSaved) onSaved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al guardar el tercero.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="md" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ fontWeight: 'bold' }}>
          {isEditing ? `Editar Tercero: ${thirdPartyToEdit?.name}` : 'Registrar Nuevo Tercero'}
        </DialogTitle>

        <DialogContent dividers>
          {errorMsg && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorMsg}
            </Alert>
          )}

          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: 'primary.main' }}>
            1. Identificación y Tipo de Tercero
          </Typography>

          <Grid container spacing={2} sx={{ mb: 2.5 }}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                select
                fullWidth
                size="small"
                label="Tipo de Persona"
                value={personType}
                onChange={(e) => setPersonType(e.target.value as ThirdPartyPersonType)}
              >
                <MenuItem value="NATURAL">Persona Natural</MenuItem>
                <MenuItem value="JURIDICA">Persona Jurídica / Empresa</MenuItem>
              </TextField>
            </Grid>

            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                select
                fullWidth
                size="small"
                label="Tipo de Documento"
                value={documentType}
                onChange={(e) => handleDocumentTypeChange(e.target.value as ThirdPartyDocumentType)}
              >
                {DOCUMENT_TYPES.map((dt) => (
                  <MenuItem key={dt.value} value={dt.value}>
                    {dt.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid size={{ xs: 12, sm: 4 }}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  label="Número de Documento"
                  value={documentNumber}
                  onChange={(e) => handleDocumentNumberChange(e.target.value)}
                  disabled={isEditing}
                  required
                  helperText={isEditing ? 'Documento inmutable' : ''}
                />
                {documentType === 'NIT' && (
                  <TextField
                    sx={{ width: 70 }}
                    size="small"
                    label="DV"
                    value={verificationDigit}
                    onChange={(e) => setVerificationDigit(e.target.value)}
                    slotProps={{ htmlInput: { maxLength: 1 } }}
                  />
                )}
              </Box>
            </Grid>

            <Grid size={{ xs: 12, sm: 8 }}>
              <TextField
                fullWidth
                size="small"
                label="Nombre Completo o Razón Social"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                size="small"
                label="Nombre Comercial"
                value={tradeName}
                onChange={(e) => setTradeName(e.target.value)}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                size="small"
                label="Persona de Contacto"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                fullWidth
                size="small"
                label="Régimen Tributario"
                value={taxRegime}
                onChange={(e) => setTaxRegime(e.target.value as ThirdPartyTaxRegime)}
              >
                {TAX_REGIMES.map((r) => (
                  <MenuItem key={r.value} value={r.value}>
                    {r.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: 'primary.main' }}>
            2. Roles de Operación en el Sistema
          </Typography>

          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 2.5, bgcolor: 'action.hover', p: 1.5, borderRadius: 1.5 }}>
            <FormControlLabel
              control={<Checkbox checked={isCustomer} onChange={(e) => setIsCustomer(e.target.checked)} color="primary" />}
              label={<Typography variant="body2" sx={{ fontWeight: 600 }}>Cliente (Facturación y Cartera)</Typography>}
            />
            <FormControlLabel
              control={<Checkbox checked={isSupplier} onChange={(e) => setIsSupplier(e.target.checked)} color="secondary" />}
              label={<Typography variant="body2" sx={{ fontWeight: 600 }}>Proveedor (Compras y CxP)</Typography>}
            />
            <FormControlLabel
              control={<Checkbox checked={isEmployee} onChange={(e) => setIsEmployee(e.target.checked)} color="info" />}
              label={<Typography variant="body2" sx={{ fontWeight: 600 }}>Empleado / Colaborador</Typography>}
            />
            <FormControlLabel
              control={<Checkbox checked={isOther} onChange={(e) => setIsOther(e.target.checked)} />}
              label={<Typography variant="body2" sx={{ fontWeight: 600 }}>Otro / Beneficiario</Typography>}
            />
          </Box>

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: 'primary.main' }}>
            3. Datos de Contacto y Ubicación
          </Typography>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                size="small"
                label="Teléfono / Celular"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                size="small"
                type="email"
                label="Correo Electrónico"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                size="small"
                label="Dirección"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField
                fullWidth
                size="small"
                label="Ciudad / Municipio"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField
                fullWidth
                size="small"
                label="Departamento"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <TextField
                fullWidth
                size="small"
                multiline
                rows={2}
                label="Notas / Observaciones"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={loading} color="inherit">
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={loading}
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : null}
          >
            {loading ? 'Guardando…' : isEditing ? 'Guardar Cambios' : 'Registrar Tercero'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
