import { describe, it, expect } from 'vitest';
import { Argon2PasswordHasherAdapter } from '../../src/modules/identity/infrastructure/adapters/argon2-password-hasher.adapter';

describe('Argon2PasswordHasherAdapter (Unit)', () => {
  // Parámetros rápidos para ejecución ágil de pruebas unitarias
  const hasher = new Argon2PasswordHasherAdapter({
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  it('debe generar un hash Argon2id válido con formato PHC', async () => {
    const plain = 'ContrasenaSegura#2026';
    const hash = await hasher.hash(plain);

    expect(typeof hash).toBe('string');
    expect(hash.startsWith('$argon2id$v=19$')).toBe(true);
    expect(hash).not.toBe(plain);
  });

  it('debe generar hashes distintos para la misma contraseña (sal aleatoria)', async () => {
    const plain = 'MismaPassword$123';
    const hash1 = await hasher.hash(plain);
    const hash2 = await hasher.hash(plain);

    expect(hash1).not.toBe(hash2);
  });

  it('debe verificar exitosamente la contraseña correcta contra su hash', async () => {
    const plain = 'MiClaveSecreta@456';
    const hash = await hasher.hash(plain);

    const isValid = await hasher.verify(plain, hash);
    expect(isValid).toBe(true);
  });

  it('debe rechazar una contraseña incorrecta', async () => {
    const plain = 'PasswordOriginal#1';
    const hash = await hasher.hash(plain);

    const isValid = await hasher.verify('PasswordIncorrecta#2', hash);
    expect(isValid).toBe(false);
  });

  it('debe retornar false de forma segura ante contraseñas vacías o hashes corruptos', async () => {
    expect(await hasher.verify('', 'hash_ficticio')).toBe(false);
    expect(await hasher.verify('cualquier_cosa', '')).toBe(false);
    expect(await hasher.verify('cualquier_cosa', '$argon2id$v=19$corrupto')).toBe(
      false
    );
  });
});
