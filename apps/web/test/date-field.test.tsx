import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DateField, fromPickerValue, toPickerValue } from '../src/components/DateField';
import { dateFieldText, setDateField } from './support-date';

const originalTz = process.env.TZ;

/** Zona del equipo del usuario; Node aplica el cambio de TZ en caliente. */
function withMachineTimeZone(tz: string) {
  process.env.TZ = tz;
}

function Host({ initial = '', onValue }: { initial?: string; onValue: (value: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <DateField
      label="Fecha"
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
    />
  );
}

// Equipos en zonas muy distintas a Bogotá, incluida una donde la medianoche no existe el día
// del cambio de horario (Santiago de Chile, 2026-09-06).
const MACHINE_ZONES = [
  'America/Bogota',
  'UTC',
  'Pacific/Kiritimati',
  'Pacific/Pago_Pago',
  'Asia/Tokyo',
  'America/Santiago',
];
const DAYS = ['2026-01-01', '2026-09-06', '2026-11-02', '2026-12-31'];

describe('DateField: la fecha que elige el usuario es la que llega a la API', () => {
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTz;
  });

  it.each(MACHINE_ZONES)('ida y vuelta sin cambiar de día con el equipo en %s', (tz) => {
    withMachineTimeZone(tz);
    for (const day of DAYS) {
      expect(fromPickerValue(toPickerValue(day))).toBe(day);
    }
    expect(toPickerValue('')).toBeNull();
    expect(toPickerValue('2026-02-30')).toBeNull();
    expect(fromPickerValue(null)).toBe('');
  });

  it.each([
    // 23:59:59 en Bogotá = ya es el día siguiente en UTC y en Tokio
    ['2026-11-03T04:59:59.000Z', 'Asia/Tokyo'],
    ['2026-11-03T04:59:59.000Z', 'Pacific/Kiritimati'],
    // 00:00:01 en Bogotá = todavía el día anterior en Pago Pago
    ['2026-11-02T05:00:01.000Z', 'Pacific/Pago_Pago'],
    // Equipo en Santiago la noche en que su medianoche no existe (cambio de horario)
    ['2026-09-06T04:30:00.000Z', 'America/Santiago'],
  ])('a las %s con el equipo en %s envía la fecha escrita, sin correrla', (now, tz) => {
    withMachineTimeZone(tz);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(now));
    const onValue = vi.fn();
    render(<Host initial="2026-11-02" onValue={onValue} />);

    expect(dateFieldText('Fecha')).toBe('02/11/2026');
    setDateField('Fecha', '2026-11-03');
    expect(onValue).toHaveBeenLastCalledWith('2026-11-03');
    expect(dateFieldText('Fecha')).toBe('03/11/2026');
    setDateField('Fecha', '2026-12-31');
    expect(onValue).toHaveBeenLastCalledWith('2026-12-31');
    setDateField('Fecha', '2026-09-06');
    expect(onValue).toHaveBeenLastCalledWith('2026-09-06');
    expect(dateFieldText('Fecha')).toBe('06/09/2026');
  });

  it('el día de hoy del calendario es el de Bogotá aunque el equipo ya esté en el día siguiente', () => {
    withMachineTimeZone('Asia/Tokyo');
    vi.useFakeTimers({ toFake: ['Date'] });
    // 22:30 del 2 de noviembre en Bogotá; 12:30 del 3 de noviembre en Tokio
    vi.setSystemTime(new Date('2026-11-03T03:30:00.000Z'));
    const onValue = vi.fn();
    render(<Host onValue={onValue} />);

    fireEvent.click(screen.getByRole('button', { name: /fecha/i }));
    const calendar = screen.getByRole('grid');
    const today = within(calendar).getByRole('gridcell', { current: 'date' });
    expect(today).toHaveTextContent('2');
    fireEvent.click(today);
    expect(onValue).toHaveBeenLastCalledWith('2026-11-02');
  });

  it('muestra dd/mm/aaaa en español y borrar la fecha la deja vacía', () => {
    const onValue = vi.fn();
    render(<Host onValue={onValue} />);
    expect(screen.getByRole('spinbutton', { name: 'Dia' })).toHaveTextContent('dd');
    expect(screen.getByRole('spinbutton', { name: 'Mes' })).toHaveTextContent('mm');
    expect(screen.getByRole('spinbutton', { name: 'Año' })).toHaveTextContent('aaaa');
    setDateField('Fecha', '2026-07-15');
    expect(onValue).toHaveBeenLastCalledWith('2026-07-15');
    setDateField('Fecha', '');
    expect(onValue).toHaveBeenLastCalledWith('');
  });
});
