import { fireEvent, screen } from '@testing-library/react';

/**
 * Escribe una fecha calendario (YYYY-MM-DD) en el selector compartido `DateField`, como la
 * escribiría el usuario: dd/mm/aaaa en el input del campo, ubicado por su etiqueta visible o
 * por su `aria-label`.
 */
export function setDateField(label: string | RegExp, isoDate: string) {
  const matches = (text: string | null) =>
    text != null && (typeof label === 'string' ? text.trim() === label : label.test(text));
  const byLabel = Array.from(document.querySelectorAll('label')).find((el) =>
    matches(el.textContent?.replace(/\s*\*\s*$/, '') ?? null),
  );
  const input = byLabel
    ? (document.getElementById(byLabel.htmlFor) as HTMLInputElement | null)
    : Array.from(document.querySelectorAll<HTMLInputElement>('input[aria-label]')).find((el) =>
        matches(el.getAttribute('aria-label')),
      );
  if (!input) throw new Error(`No hay un selector de fecha con la etiqueta ${String(label)}`);
  const [year, month, day] = isoDate.split('-');
  fireEvent.change(input, { target: { value: isoDate ? `${day}/${month}/${year}` : '' } });
  return input;
}

/** Texto visible dd/mm/aaaa del selector con esa etiqueta. */
export function dateFieldText(label: string) {
  const byLabel = screen.getByText(label, { selector: 'label' }) as HTMLLabelElement;
  return (document.getElementById(byLabel.htmlFor) as HTMLInputElement).value;
}
