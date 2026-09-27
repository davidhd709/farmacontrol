import { describe, it, expect, vi } from 'vitest';
import { PasswordService } from '../../src/modules/identity/application/services/password.service';
import { PasswordHasherPort } from '../../src/modules/identity/application/ports/password-hasher.port';
import { WeakPasswordException } from '../../src/modules/identity/domain/exceptions/identity.exceptions';

describe('PasswordService (Unit)', () => {
  const mockHasher: PasswordHasherPort = {
    hash: vi.fn().mockImplementation(async (p: string) => `hashed_${p}`),
    verify: vi
      .fn()
      .mockImplementation(
        async (p: string, h: string) => h === `hashed_${p}`
      ),
  };

  const passwordService = new PasswordService(mockHasher);

  describe('Validación de robustez de contraseña', () => {
    it('debe aceptar contraseñas que cumplen todos los requisitos', () => {
      expect(() =>
        passwordService.validatePasswordStrength('Segura#2026')
      ).not.toThrow();
      expect(() =>
        passwordService.validatePasswordStrength('Clave.Fuerte!99')
      ).not.toThrow();
    });

    it('debe rechazar contraseñas con menos de 10 caracteres', () => {
      expect(() =>
        passwordService.validatePasswordStrength('C0rt@1')
      ).toThrow(WeakPasswordException);
      expect(() =>
        passwordService.validatePasswordStrength('Nueve123!')
      ).toThrow(WeakPasswordException);
    });

    it('debe rechazar contraseñas sin minúsculas', () => {
      expect(() =>
        passwordService.validatePasswordStrength('PASSWORD#1234')
      ).toThrow(WeakPasswordException);
    });

    it('debe rechazar contraseñas sin mayúsculas', () => {
      expect(() =>
        passwordService.validatePasswordStrength('password#1234')
      ).toThrow(WeakPasswordException);
    });

    it('debe rechazar contraseñas sin números', () => {
      expect(() =>
        passwordService.validatePasswordStrength('PasswordSinNumeros#')
      ).toThrow(WeakPasswordException);
    });

    it('debe rechazar contraseñas sin caracteres especiales', () => {
      expect(() =>
        passwordService.validatePasswordStrength('PasswordConNumero1234')
      ).toThrow(WeakPasswordException);
    });

    it('debe aceptar una contraseña de exactamente 128 caracteres (límite máximo permitido F-15)', () => {
      // 128 caracteres: "Pass#1" (6) + 'a' repetida 122 veces = 128
      const exact128Password = 'Pass#1' + 'a'.repeat(122);
      expect(exact128Password).toHaveLength(128);
      expect(() =>
        passwordService.validatePasswordStrength(exact128Password)
      ).not.toThrow();
    });

    it('debe rechazar una contraseña de 129 caracteres por exceder el máximo (F-15)', () => {
      const tooLong129Password = 'Pass#1' + 'a'.repeat(123);
      expect(tooLong129Password).toHaveLength(129);
      expect(() =>
        passwordService.validatePasswordStrength(tooLong129Password)
      ).toThrow('La contraseña no puede exceder los 128 caracteres.');
    });

    it('debe rechazar inmediatamente una entrada excesivamente grande (mitigación DoS F-15)', () => {
      const hugePassword = 'Pass#1' + 'a'.repeat(100000);
      expect(() =>
        passwordService.validatePasswordStrength(hugePassword)
      ).toThrow(WeakPasswordException);
    });
  });

  describe('hashPassword y verifyPassword', () => {
    it('debe validar la robustez antes de generar el hash', async () => {
      await expect(
        passwordService.hashPassword('insegura')
      ).rejects.toThrow(WeakPasswordException);

      const hash = await passwordService.hashPassword('Valida#2026!');
      expect(hash).toBe('hashed_Valida#2026!');
      expect(mockHasher.hash).toHaveBeenCalledWith('Valida#2026!');
    });

    it('debe delegar la verificación al hasher', async () => {
      const isValid = await passwordService.verifyPassword(
        'Valida#2026!',
        'hashed_Valida#2026!'
      );
      expect(isValid).toBe(true);

      const isInvalid = await passwordService.verifyPassword(
        'Otra#2026!',
        'hashed_Valida#2026!'
      );
      expect(isInvalid).toBe(false);
    });
  });
});
