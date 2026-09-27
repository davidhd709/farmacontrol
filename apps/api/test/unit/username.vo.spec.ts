import { describe, it, expect } from 'vitest';
import { Username } from '../../src/modules/identity/domain/value-objects/username.vo';
import { InvalidUsernameException } from '../../src/modules/identity/domain/exceptions/identity.exceptions';

describe('Username Value Object (Unit)', () => {
  it('debe crear una instancia válida de Username', () => {
    const vo = Username.create('farmaceutico_01');
    expect(vo.value).toBe('farmaceutico_01');
    expect(vo.toString()).toBe('farmaceutico_01');
  });

  it('debe normalizar automáticamente con .trim() y .toLowerCase()', () => {
    const vo = Username.create('  Admin_Principal.Farma  ');
    expect(vo.value).toBe('admin_principal.farma');
  });

  it('debe aceptar caracteres permitidos: letras minúsculas, números, puntos, guiones y guiones bajos', () => {
    const validNames = [
      'usr.name',
      'cajero_01',
      'regente-turno',
      'user123',
      'a.b_c-1',
    ];

    for (const name of validNames) {
      const vo = Username.create(name);
      expect(vo.value).toBe(name);
    }
  });

  it('debe rechazar nombres de usuario vacíos o nulos', () => {
    expect(() => Username.create('')).toThrow(InvalidUsernameException);
    expect(() => Username.create('   ')).toThrow(InvalidUsernameException);
    // @ts-expect-error probando valor inválido
    expect(() => Username.create(null)).toThrow(InvalidUsernameException);
  });

  it('debe rechazar nombres de usuario con menos de 3 caracteres', () => {
    expect(() => Username.create('ab')).toThrow(InvalidUsernameException);
    expect(() => Username.create(' a ')).toThrow(InvalidUsernameException);
  });

  it('debe rechazar nombres de usuario con más de 50 caracteres', () => {
    const longName = 'a'.repeat(51);
    expect(() => Username.create(longName)).toThrow(InvalidUsernameException);
  });

  it('debe rechazar nombres de usuario con espacios intermedios', () => {
    expect(() => Username.create('usuario con espacio')).toThrow(
      InvalidUsernameException
    );
  });

  it('debe rechazar nombres de usuario con caracteres especiales no permitidos', () => {
    const invalidNames = [
      'usuario@farmacia.com',
      'cajero#1',
      'admin$root',
      'usuario!valido',
      'farmacéutico', // acento no permitido en identificador de acceso
    ];

    for (const invalid of invalidNames) {
      expect(() => Username.create(invalid)).toThrow(InvalidUsernameException);
    }
  });

  it('debe comparar igualdad entre dos Value Objects Username', () => {
    const vo1 = Username.create('Admin_01');
    const vo2 = Username.create('admin_01');
    const vo3 = Username.create('admin_02');

    expect(vo1.equals(vo2)).toBe(true);
    expect(vo1.equals(vo3)).toBe(false);
  });
});
