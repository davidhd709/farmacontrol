import React, { useState, useEffect, useMemo } from 'react';
import {
  Autocomplete,
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
import {
  DIVIPOLA_DEPARTMENTS,
  getMunicipalitiesByDepartment,
  filterDivipolaDepartments,
  filterDivipolaMunicipalities,
  resolveThirdPartyDivipolaLocation,
  type DivipolaDepartment,
  type DivipolaMunicipality,
  type ThirdPartyDto,
  type ThirdPartyDocumentType,
  type ThirdPartyPersonType,
  type ThirdPartyTaxRegime,
  type CreateThirdPartyPayload,
  type UpdateThirdPartyPayload,
} from '@farmacia/contracts';
import { createThirdParty, updateThirdParty } from '../api/third-parties.api';

interface ThirdPartyFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  thirdPartyToEdit?: ThirdPartyDto | null;
  /**
   * Tipos que el usuario puede asignar (cartera: clientes; compras: proveedores). Sin valor,
   * todos. Los demás tipos se muestran pero no se pueden cambiar; la API aplica la misma regla.
   */
  allowedRoles?: Array<'CUSTOMER' | 'SUPPLIER'>;
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
  allowedRoles,
}) => {
  const isEditing = Boolean(thirdPartyToEdit);
  const scoped = allowedRoles !== undefined;
  // Con un solo tipo permitido, ese tipo queda fijo; con alcance, los demás no se tocan
  const lockCustomer = scoped && (!allowedRoles.includes('CUSTOMER') || allowedRoles.length === 1);
  const lockSupplier = scoped && (!allowedRoles.includes('SUPPLIER') || allowedRoles.length === 1);

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
  const [selectedDepartment, setSelectedDepartment] = useState<DivipolaDepartment | null>(null);
  const [selectedMunicipality, setSelectedMunicipality] = useState<DivipolaMunicipality | null>(
    null,
  );
  const [locationTouched, setLocationTouched] = useState(false);
  const [preservedLegacyLocation, setPreservedLegacyLocation] = useState<{
    department: string | null;
    city: string | null;
  } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [taxRegime, setTaxRegime] = useState<ThirdPartyTaxRegime>('NO_RESPONSABLE_IVA');

  const availableMunicipalities = useMemo(
    () => (selectedDepartment ? getMunicipalitiesByDepartment(selectedDepartment.code) : []),
    [selectedDepartment],
  );

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

      const locResolution = resolveThirdPartyDivipolaLocation({
        department: thirdPartyToEdit.department,
        city: thirdPartyToEdit.city,
        departmentCode: thirdPartyToEdit.departmentCode,
        municipalityCode: thirdPartyToEdit.municipalityCode,
      });

      if (locResolution.status === 'EMPTY') {
        setSelectedDepartment(null);
        setSelectedMunicipality(null);
        setPreservedLegacyLocation(null);
      } else if (
        locResolution.status === 'RESOLVED' ||
        locResolution.status === 'RESOLVED_UNIQUE_CITY'
      ) {
        setSelectedDepartment(locResolution.department);
        setSelectedMunicipality(locResolution.municipality);
        setPreservedLegacyLocation(null);
      } else if (locResolution.status === 'DEPARTMENT_ONLY') {
        setSelectedDepartment(locResolution.department);
        setSelectedMunicipality(null);
        setPreservedLegacyLocation({
          department: thirdPartyToEdit.department || null,
          city: thirdPartyToEdit.city || null,
        });
      } else {
        // Nombres antiguos, errores de escritura o municipio ambiguo sin departamento:
        // no asignar municipio automáticamente cuando haya dudas y conservar el original.
        setSelectedDepartment(locResolution.department);
        setSelectedMunicipality(null);
        setPreservedLegacyLocation({
          department: thirdPartyToEdit.department || null,
          city: thirdPartyToEdit.city || null,
        });
      }
      setLocationTouched(false);
      setLocationError(null);

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
      setSelectedDepartment(null);
      setSelectedMunicipality(null);
      setPreservedLegacyLocation(null);
      setLocationTouched(false);
      setLocationError(null);
      setTaxRegime('NO_RESPONSABLE_IVA');
      setIsCustomer(!scoped || allowedRoles.includes('CUSTOMER'));
      setIsSupplier(scoped && !allowedRoles.includes('CUSTOMER'));
      setIsEmployee(false);
      setIsOther(false);
      setNotes('');
    }
    setErrorMsg(null);
  }, [thirdPartyToEdit, open]);

  const handleDepartmentChange = (
    _: React.SyntheticEvent,
    newDepartment: DivipolaDepartment | null,
  ) => {
    setSelectedDepartment(newDepartment);
    setSelectedMunicipality(null);
    setLocationTouched(true);
    setPreservedLegacyLocation(null);
    setLocationError(null);
  };

  const handleMunicipalityChange = (
    _: React.SyntheticEvent,
    newMunicipality: DivipolaMunicipality | null,
  ) => {
    setSelectedMunicipality(newMunicipality);
    setLocationTouched(true);
    setPreservedLegacyLocation(null);
    setLocationError(null);
  };

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

    const usingLegacyUntouched = Boolean(!locationTouched && preservedLegacyLocation);
    if (!usingLegacyUntouched) {
      if (selectedDepartment && !selectedMunicipality) {
        const msg = 'Seleccione la ciudad o municipio correspondiente al departamento elegido.';
        setLocationError(msg);
        setErrorMsg(msg);
        return;
      }
      if (
        selectedMunicipality &&
        (!selectedDepartment || selectedMunicipality.departmentCode !== selectedDepartment.code)
      ) {
        const msg = 'El municipio seleccionado no pertenece al departamento elegido.';
        setLocationError(msg);
        setErrorMsg(msg);
        return;
      }
    }

    const finalDepartment = usingLegacyUntouched
      ? preservedLegacyLocation!.department
      : (selectedDepartment?.name ?? null);
    const finalCity = usingLegacyUntouched
      ? preservedLegacyLocation!.city
      : (selectedMunicipality?.name ?? null);
    const finalDepartmentCode = usingLegacyUntouched
      ? undefined
      : (selectedDepartment?.code ?? null);
    const finalMunicipalityCode = usingLegacyUntouched
      ? undefined
      : (selectedMunicipality?.code ?? null);

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
          city: finalCity,
          department: finalDepartment,
          ...(finalDepartmentCode !== undefined ? { departmentCode: finalDepartmentCode } : {}),
          ...(finalMunicipalityCode !== undefined
            ? { municipalityCode: finalMunicipalityCode }
            : {}),
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
          city: finalCity,
          department: finalDepartment,
          departmentCode: finalDepartmentCode ?? null,
          municipalityCode: finalMunicipalityCode ?? null,
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
              control={<Checkbox checked={isCustomer} disabled={lockCustomer} onChange={(e) => setIsCustomer(e.target.checked)} color="primary" />}
              label={<Typography variant="body2" sx={{ fontWeight: 600 }}>Cliente (Facturación y Cartera)</Typography>}
            />
            <FormControlLabel
              control={<Checkbox checked={isSupplier} disabled={lockSupplier} onChange={(e) => setIsSupplier(e.target.checked)} color="secondary" />}
              label={<Typography variant="body2" sx={{ fontWeight: 600 }}>Proveedor (Compras y CxP)</Typography>}
            />
            <FormControlLabel
              control={<Checkbox checked={isEmployee} disabled={scoped} onChange={(e) => setIsEmployee(e.target.checked)} color="info" />}
              label={<Typography variant="body2" sx={{ fontWeight: 600 }}>Empleado / Colaborador</Typography>}
            />
            <FormControlLabel
              control={<Checkbox checked={isOther} disabled={scoped} onChange={(e) => setIsOther(e.target.checked)} />}
              label={<Typography variant="body2" sx={{ fontWeight: 600 }}>Otro / Beneficiario</Typography>}
            />
          </Box>

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: 'primary.main' }}>
            3. Datos de Contacto y Ubicación
          </Typography>

          {preservedLegacyLocation &&
            !locationTouched &&
            (preservedLegacyLocation.city || preservedLegacyLocation.department) && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Ubicación registrada actualmente:{' '}
                <strong>
                  {[preservedLegacyLocation.city, preservedLegacyLocation.department]
                    .filter(Boolean)
                    .join(', ')}
                </strong>
                . No coincide de forma unívoca con el catálogo oficial DIVIPOLA; se conservará el
                dato original a menos que seleccione un Departamento y Ciudad / Municipio para
                corregirla.
              </Alert>
            )}

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
              <Autocomplete<DivipolaDepartment, false, false, false>
                options={DIVIPOLA_DEPARTMENTS}
                value={selectedDepartment}
                onChange={handleDepartmentChange}
                getOptionLabel={(option) => option.name}
                isOptionEqualToValue={(option, val) => option.code === val.code}
                filterOptions={(options, state) =>
                  filterDivipolaDepartments(options, state.inputValue)
                }
                autoHighlight
                clearOnBlur
                fullWidth
                size="small"
                noOptionsText="No se encontraron departamentos"
                openText="Abrir lista de departamentos"
                closeText="Cerrar lista de departamentos"
                clearText="Limpiar departamento"
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Departamento"
                    placeholder="Buscar departamento..."
                    size="small"
                  />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 3 }}>
              <Autocomplete<DivipolaMunicipality, false, false, false>
                options={availableMunicipalities}
                value={selectedMunicipality}
                onChange={handleMunicipalityChange}
                disabled={!selectedDepartment}
                getOptionLabel={(option) => option.name}
                isOptionEqualToValue={(option, val) => option.code === val.code}
                filterOptions={(options, state) =>
                  filterDivipolaMunicipalities(options, state.inputValue)
                }
                autoHighlight
                clearOnBlur
                fullWidth
                size="small"
                noOptionsText="No se encontraron municipios en este departamento"
                openText="Abrir lista de municipios"
                closeText="Cerrar lista de municipios"
                clearText="Limpiar municipio"
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Ciudad / Municipio"
                    placeholder={
                      selectedDepartment ? 'Buscar municipio...' : 'Seleccione departamento'
                    }
                    size="small"
                    error={Boolean(locationError)}
                    helperText={locationError ?? undefined}
                  />
                )}
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
