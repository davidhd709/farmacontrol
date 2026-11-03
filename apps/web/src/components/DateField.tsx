import type React from 'react';
import type { SxProps, Theme } from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { esES } from '@mui/x-date-pickers/locales';
import dayjs, { type Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import 'dayjs/locale/es';

dayjs.extend(utc);
dayjs.extend(timezone);

/** Zona del negocio: el "hoy" del calendario es el día de Bogotá, no el del equipo. */
export const DATE_FIELD_TIME_ZONE = 'America/Bogota';
const DISPLAY_FORMAT = 'DD/MM/YYYY';
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

const localeText = {
  ...esES.components.MuiLocalizationProvider.defaultProps.localeText,
  fieldDayPlaceholder: () => 'dd',
  fieldMonthPlaceholder: () => 'mm',
  fieldYearPlaceholder: (params: { digitAmount: number }) => 'a'.repeat(params.digitAmount),
};

/** Fecha calendario YYYY-MM-DD → instante del picker en Bogotá; vacío o inválido → null. */
export function toPickerValue(value: string | null | undefined): Dayjs | null {
  if (!value || !CALENDAR_DAY.test(value)) return null;
  // Al mediodía y no a medianoche: dayjs.tz corre el día si la medianoche no existe en la zona
  // del equipo (cambio de horario). dayjs desborda días inexistentes (30 de febrero): se rechazan.
  const parsed = dayjs.tz(`${value}T12:00:00`, DATE_FIELD_TIME_ZONE);
  return parsed.isValid() && parsed.format('YYYY-MM-DD') === value ? parsed : null;
}

/**
 * Valor del picker → fecha calendario YYYY-MM-DD leída en Bogotá. Una fecha incompleta o
 * inválida vuelve como '' (igual que el input nativo), para que el filtro o el formulario la
 * trate como vacía.
 */
export function fromPickerValue(value: Dayjs | null): string {
  if (!value || !value.isValid()) return '';
  return value.tz(DATE_FIELD_TIME_ZONE).format('YYYY-MM-DD');
}

export interface DateFieldProps {
  label?: React.ReactNode;
  /** Fecha calendario YYYY-MM-DD; '' o null si está vacía. */
  value: string | null | undefined;
  /** Recibe la fecha calendario YYYY-MM-DD, o '' si se borra o queda incompleta. */
  onChange: (value: string) => void;
  onBlur?: () => void;
  name?: string;
  id?: string;
  size?: 'small' | 'medium';
  fullWidth?: boolean;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  helperText?: React.ReactNode;
  /** Límites como fecha calendario YYYY-MM-DD. */
  minDate?: string;
  maxDate?: string;
  sx?: SxProps<Theme>;
  inputRef?: React.Ref<HTMLInputElement>;
  /** Permite pasar `{...field}` de react-hook-form, que trae `ref`. */
  ref?: React.Ref<HTMLInputElement>;
  /** Nombre accesible cuando no hay etiqueta visible (por ejemplo, en una celda de tabla). */
  'aria-label'?: string;
  'data-testid'?: string;
}

/**
 * Selector de fecha compartido (MUI X): español, dd/mm/aaaa y zona America/Bogota. Recibe y
 * entrega la fecha calendario YYYY-MM-DD que antes daba el input nativo, sin convertirla a un
 * instante: lo que el usuario elige es lo que llega a la API, a cualquier hora y desde
 * cualquier zona del equipo.
 */
export function DateField({
  label,
  value,
  onChange,
  onBlur,
  name,
  id,
  size,
  fullWidth,
  required,
  disabled,
  error,
  helperText,
  minDate,
  maxDate,
  sx,
  inputRef,
  ref,
  'aria-label': ariaLabel,
  'data-testid': testId,
}: DateFieldProps) {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="es" localeText={localeText}>
      <DatePicker
        label={label}
        value={toPickerValue(value)}
        onChange={(next) => onChange(fromPickerValue(next))}
        timezone={DATE_FIELD_TIME_ZONE}
        format={DISPLAY_FORMAT}
        name={name}
        disabled={disabled}
        minDate={toPickerValue(minDate) ?? undefined}
        maxDate={toPickerValue(maxDate) ?? undefined}
        inputRef={inputRef ?? ref}
        sx={sx}
        slotProps={{
          field: { clearable: !required },
          textField: {
            id,
            size,
            fullWidth,
            required,
            error,
            helperText,
            onBlur,
            slotProps: {
              input: ariaLabel ? { 'aria-label': ariaLabel } : undefined,
              htmlInput: {
                'aria-label': ariaLabel,
                ...(testId ? { 'data-testid': testId } : {}),
              } as React.InputHTMLAttributes<HTMLInputElement>,
            },
          },
        }}
      />
    </LocalizationProvider>
  );
}
