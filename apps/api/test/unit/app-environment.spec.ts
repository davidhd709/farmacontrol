import { describe, expect, it } from 'vitest';
import { resolveAppEnvironment } from '../../src/app.service';

describe('resolveAppEnvironment', () => {
  it.each([
    ['produccion', 'produccion'],
    ['pruebas', 'pruebas'],
    [' Pruebas ', 'pruebas'],
    ['desarrollo', 'desarrollo'],
  ] as const)('reconoce %j', (raw, expected) => {
    expect(resolveAppEnvironment(raw)).toBe(expected);
  });

  it.each([undefined, '', 'production', 'staging', 'prueba'])(
    'devuelve null con un valor ausente o desconocido (%j): la interfaz no presume producción',
    (raw) => {
      expect(resolveAppEnvironment(raw)).toBeNull();
    },
  );
});
