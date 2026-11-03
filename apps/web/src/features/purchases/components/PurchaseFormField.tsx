import { TextField, type TextFieldProps } from '@mui/material';
import { Controller, type Control, type FieldPath } from 'react-hook-form';
import { DateField } from '../../../components/DateField';
import type { ReceivePurchaseFormValues } from '../validation/receive-purchase.schema';

type Props = Omit<TextFieldProps, 'name'> & {
  name: FieldPath<ReceivePurchaseFormValues>;
  control: Control<ReceivePurchaseFormValues>;
  /** Con `type="date"`: recibe la fecha calendario YYYY-MM-DD del selector compartido. */
  onDateChange?: (value: string) => void;
};

// Las dos vistas de recepción comparten el enlace al formulario y los mensajes por campo.
export function PurchaseFormField({
  name,
  control,
  helperText,
  onChange,
  onDateChange,
  ...props
}: Props) {
  const [, index, lineField] = name.split('.');
  const lineLabels: Record<string, string> = {
    productId: 'Producto',
    presentationId: 'Presentación',
    lotNumber: 'Número de lote',
    expirationDate: 'Fecha de vencimiento',
    serialNumbers: 'Series',
    quantityCommercial: 'Cantidad',
    unitCost: 'Costo',
  };
  const inputLabel = `${lineLabels[lineField]} línea ${Number(index) + 1}`;
  return (
    <Controller
      name={name}
      control={control}
      render={({ field: { ref, ...field }, fieldState }) =>
        props.type === 'date' ? (
          <DateField
            label={props.label}
            aria-label={props.label ? undefined : inputLabel}
            name={field.name}
            value={typeof field.value === 'string' ? field.value : ''}
            onChange={onDateChange ?? field.onChange}
            onBlur={field.onBlur}
            inputRef={ref}
            size={props.size === 'small' ? 'small' : 'medium'}
            fullWidth={props.fullWidth}
            required={props.required}
            disabled={props.disabled}
            error={Boolean(fieldState.error)}
            helperText={fieldState.error?.message || helperText}
          />
        ) : (
          <TextField
            {...props}
            {...field}
            inputRef={ref}
            {...(!props.label
              ? {
                  label: undefined,
                  slotProps: {
                    ...props.slotProps,
                    select: { ...props.slotProps?.select, 'aria-label': inputLabel },
                    htmlInput: { ...props.slotProps?.htmlInput, 'aria-label': inputLabel },
                  },
                }
              : {})}
            onChange={onChange ?? field.onChange}
            error={Boolean(fieldState.error)}
            helperText={fieldState.error?.message || helperText}
          />
        )
      }
    />
  );
}
