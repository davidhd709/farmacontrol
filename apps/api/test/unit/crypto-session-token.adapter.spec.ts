import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  CryptoSessionTokenAdapter,
  SESSION_TOKEN_ENTROPY_BYTES,
} from '../../src/modules/identity/infrastructure/adapters/crypto-session-token.adapter';
import { InvalidSessionTokenException } from '../../src/modules/identity/domain/exceptions/identity.exceptions';

describe('CryptoSessionTokenAdapter (CSPRNG & SHA-256)', () => {
  const adapter = new CryptoSessionTokenAdapter();

  it('debe definir una entropía base de 32 bytes (256 bits)', () => {
    expect(SESSION_TOKEN_ENTROPY_BYTES).toBe(32);
  });

  it('debe generar tokens con formato hexadecimal de exactamente 64 caracteres (256 bits de entropía)', () => {
    const { rawToken, tokenHash } = adapter.generate();

    // rawToken: 32 bytes codificados en hex = 64 caracteres [0-9a-f]
    expect(rawToken).toHaveLength(64);
    expect(rawToken).toMatch(/^[0-9a-f]{64}$/);

    // tokenHash: SHA-256 digest = 64 caracteres [0-9a-f]
    expect(tokenHash).toHaveLength(64);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);

    // El rawToken debe ser completamente opaco (sin puntos de JWT ni separadores)
    expect(rawToken).not.toContain('.');
    expect(rawToken).not.toContain(':');
    expect(rawToken).not.toContain('/');
  });

  it('debe garantizar que dos tokens generados consecutivamente sean diferentes (no determinismo CSPRNG)', () => {
    const token1 = adapter.generate();
    const token2 = adapter.generate();

    expect(token1.rawToken).not.toBe(token2.rawToken);
    expect(token1.tokenHash).not.toBe(token2.tokenHash);
  });

  it('debe calcular hashes deterministas mediante SHA-256 (mismo token -> mismo hash)', () => {
    const { rawToken } = adapter.generate();

    const hash1 = adapter.hash(rawToken);
    const hash2 = adapter.hash(rawToken);

    expect(hash1).toBe(hash2);

    // Verificación independiente con createHash estándar de Node.js
    const expectedHash = createHash('sha256').update(rawToken, 'utf8').digest('hex');
    expect(hash1).toBe(expectedHash);
  });

  it('debe garantizar que tokens diferentes produzcan hashes diferentes', () => {
    const token1 = adapter.generate();
    const token2 = adapter.generate();

    const hash1 = adapter.hash(token1.rawToken);
    const hash2 = adapter.hash(token2.rawToken);

    expect(hash1).not.toBe(hash2);
  });

  it('debe rechazar cadenas vacías o tokens nulos en hash()', () => {
    expect(() => adapter.hash('')).toThrow(InvalidSessionTokenException);
    expect(() => adapter.hash('   ')).toThrow(InvalidSessionTokenException);
    // @ts-expect-error validación en runtime
    expect(() => adapter.hash(null)).toThrow(InvalidSessionTokenException);
  });
});
