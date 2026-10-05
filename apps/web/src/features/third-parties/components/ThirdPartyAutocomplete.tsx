import React, { useState, useEffect, useCallback } from 'react';
import {
  Autocomplete,
  TextField,
  Box,
  Typography,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import type { ThirdPartyDto } from '@farmacia/contracts';
import { fetchThirdParties } from '../api/third-parties.api';
import { ThirdPartyFormDialog } from './ThirdPartyFormDialog';

export interface ThirdPartyAutocompleteProps {
  value: ThirdPartyDto | null;
  onChange: (thirdParty: ThirdPartyDto | null, rawText?: string) => void;
  role?: 'CUSTOMER' | 'SUPPLIER' | 'EMPLOYEE' | 'OTHER';
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  freeSolo?: boolean;
  showQuickCreate?: boolean;
  size?: 'small' | 'medium';
  fullWidth?: boolean;
  error?: boolean;
  helperText?: string;
}

export const ThirdPartyAutocomplete: React.FC<ThirdPartyAutocompleteProps> = ({
  value,
  onChange,
  role,
  label = 'Tercero (NIT / Cédula / Razón Social)',
  placeholder = 'Buscar o seleccionar tercero...',
  required = false,
  disabled = false,
  freeSolo = false,
  showQuickCreate = true,
  size = 'small',
  fullWidth = true,
  error = false,
  helperText,
}) => {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ThirdPartyDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const searchThirdParties = useCallback(
    async (searchTerm: string) => {
      setLoading(true);
      try {
        const response = await fetchThirdParties({
          search: searchTerm.trim() || undefined,
          role,
          pageSize: 20,
        });
        setOptions(response.items);
      } catch (err) {
        console.error('Error al buscar terceros:', err);
      } finally {
        setLoading(false);
      }
    },
    [role]
  );

  // Debounced search on input change
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      searchThirdParties(inputValue);
    }, 250);
    return () => clearTimeout(timer);
  }, [inputValue, open, searchThirdParties]);

  // Initial load when opening
  useEffect(() => {
    if (open && options.length === 0) {
      searchThirdParties('');
    }
  }, [open, options.length, searchThirdParties]);

  // Handle newly created third party
  const handleThirdPartyCreated = () => {
    searchThirdParties(inputValue);
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: fullWidth ? '100%' : 'auto' }}>
      <Autocomplete<ThirdPartyDto, false, false, boolean>
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        value={value}
        onChange={(_, newValue) => {
          if (typeof newValue === 'string') {
            onChange(null, newValue);
          } else {
            onChange(newValue);
          }
        }}
        inputValue={inputValue}
        onInputChange={(_, newInputValue) => {
          setInputValue(newInputValue);
          if (freeSolo && !value) {
            onChange(null, newInputValue);
          }
        }}
        freeSolo={freeSolo}
        isOptionEqualToValue={(option, val) =>
          typeof val === 'object' && val !== null ? option.id === val.id : false
        }
        getOptionLabel={(option) => {
          if (typeof option === 'string') return option;
          const dv = option.verificationDigit ? `-${option.verificationDigit}` : '';
          return `${option.documentType} ${option.documentNumber}${dv} — ${option.name}`;
        }}
        options={options}
        loading={loading}
        disabled={disabled}
        fullWidth={fullWidth}
        size={size}
        noOptionsText="No se encontraron terceros registrados"
        loadingText="Buscando terceros..."
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            placeholder={placeholder}
            required={required}
            error={error}
            helperText={helperText}
            size={size}
          />
        )}
        renderOption={(props, option) => {
          const { key, ...restProps } = props as any;
          const dv = option.verificationDigit ? `-${option.verificationDigit}` : '';
          return (
            <Box
              key={option.id || key}
              component="li"
              {...restProps}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                py: 1,
                borderBottom: '1px solid',
                borderColor: 'divider',
                '&:last-child': { borderBottom: 'none' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {option.documentType} {option.documentNumber}{dv}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.primary', flexGrow: 1 }} noWrap>
                  {option.name}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                {option.isCustomer && (
                  <Chip label="Cliente" size="small" color="success" sx={{ fontSize: 10, height: 18 }} />
                )}
                {option.isSupplier && (
                  <Chip label="Proveedor" size="small" color="info" sx={{ fontSize: 10, height: 18 }} />
                )}
                {option.isEmployee && (
                  <Chip label="Empleado" size="small" color="secondary" sx={{ fontSize: 10, height: 18 }} />
                )}
                {option.isOther && (
                  <Chip label="Otro" size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
                )}
                {option.city && (
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    {option.city}
                  </Typography>
                )}
              </Box>
            </Box>
          );
        }}
      />

      {showQuickCreate && !disabled && (
        <Tooltip title="Registrar nuevo tercero en el directorio">
          <IconButton
            color="primary"
            size={size}
            onClick={() => setCreateDialogOpen(true)}
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
          >
            <PersonAddAltIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}

      {showQuickCreate && (
        <ThirdPartyFormDialog
          open={createDialogOpen}
          onClose={() => setCreateDialogOpen(false)}
          onSaved={handleThirdPartyCreated}
        />
      )}
    </Box>
  );
};
