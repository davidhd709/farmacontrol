import type { Locator } from '@playwright/test';

/**
 * Escribe una fecha calendario (YYYY-MM-DD) en el selector de fecha compartido de la web
 * (MUI X): se enfoca el campo y se teclean día, mes y año, como lo haría el usuario.
 * `field` es el grupo del campo (lo que devuelve getByLabel sobre su etiqueta).
 */
export async function fillDateField(field: Locator, isoDate: string) {
  const [year, month, day] = isoDate.split('-');
  await field.getByRole('spinbutton', { name: 'Dia' }).click();
  await field.page().keyboard.type(`${day}${month}${year}`);
}
