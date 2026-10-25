import { TextField, type TextFieldProps } from '@mui/material';
import { Controller, type Control, type FieldPath } from 'react-hook-form';
import type { ReceivePurchaseFormValues } from '../validation/receive-purchase.schema';

type Props = Omit<TextFieldProps, 'name'> & {
  name: FieldPath<ReceivePurchaseFormValues>;
  control: Control<ReceivePurchaseFormValues>;
};

// Las dos vistas de recepción comparten el enlace al formulario y los mensajes por campo.
export function PurchaseFormField({ name, control, helperText, onChange, ...props }: Props) {
  const [, index, lineField] = name.split('.');
  const lineLabels: Record<string, string> = {
    productId: 'Producto',
    presentationId: 'Presentación',
    lotNumber: 'Número de lote',
    expirationDate: 'Fecha de vencimiento',
    quantityCommercial: 'Cantidad',
    unitCost: 'Costo',
  };
  const inputLabel = `${lineLabels[lineField]} línea ${Number(index) + 1}`;
  return (
    <Controller
      name={name}
      control={control}
      render={({ field: { ref, ...field }, fieldState }) => (
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
      )}
    />
  );
}
