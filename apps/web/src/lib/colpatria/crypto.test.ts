import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, decrypt, esDescifrable } from './crypto';

beforeAll(() => {
  // Setea una key de prueba estable. En el .env real será otra cosa.
  process.env.COLPATRIA_ENC_KEY = 'test-key-32bytes-minimum-for-tests-only-x';
});

describe('encrypt / decrypt', () => {
  it('round-trip de string simple', () => {
    const original = 'mi-password-123';
    const cifrado = encrypt(original);
    expect(cifrado).not.toBe(original);
    expect(cifrado).not.toContain(original);
    expect(decrypt(cifrado)).toBe(original);
  });

  it('round-trip de JSON (caso cookies)', () => {
    const cookies = JSON.stringify({
      cookies: [{ name: 'sessionId', value: 'abc123', domain: '.colpatria.com' }],
      origins: [],
    });
    const cifrado = encrypt(cookies);
    const descifrado = decrypt(cifrado);
    expect(descifrado).toBe(cookies);
    expect(JSON.parse(descifrado)).toEqual(JSON.parse(cookies));
  });

  it('round-trip de strings con caracteres especiales (tildes, ñ)', () => {
    const s = 'Contraseña con ñ y áéíóú · ¿qué tal? 🔐';
    expect(decrypt(encrypt(s))).toBe(s);
  });

  it('round-trip de string vacío', () => {
    expect(decrypt(encrypt(''))).toBe('');
  });

  it('round-trip de string muy largo (10kb)', () => {
    const largo = 'a'.repeat(10_000);
    expect(decrypt(encrypt(largo))).toBe(largo);
  });

  it('cada encrypt produce un ciphertext distinto (IV aleatorio)', () => {
    const plano = 'mismo-password';
    const c1 = encrypt(plano);
    const c2 = encrypt(plano);
    expect(c1).not.toBe(c2);
    // Pero ambos descifran al mismo valor
    expect(decrypt(c1)).toBe(plano);
    expect(decrypt(c2)).toBe(plano);
  });

  it('formato del ciphertext: iv:authTag:cipher (3 partes hex)', () => {
    const cifrado = encrypt('x');
    const partes = cifrado.split(':');
    expect(partes).toHaveLength(3);
    // Los 3 son hex válido.
    for (const p of partes) {
      expect(p).toMatch(/^[0-9a-f]+$/);
    }
  });
});

describe('decrypt — manejo de errores', () => {
  it('formato inválido → throw', () => {
    expect(() => decrypt('no-es-formato-valido')).toThrow();
    expect(() => decrypt('solo:dos-partes')).toThrow();
    expect(() => decrypt('cuatro:partes:no:permitidas')).toThrow();
  });

  it('authTag corrupto → throw (detecta tampering)', () => {
    const cifrado = encrypt('secreto');
    const partes = cifrado.split(':');
    // Cambiamos un byte del authTag.
    partes[1] = (partes[1] as string).split('').reverse().join('');
    const corrupto = partes.join(':');
    expect(() => decrypt(corrupto)).toThrow();
  });

  it('cipher corrupto → throw', () => {
    const cifrado = encrypt('secreto');
    const partes = cifrado.split(':');
    partes[2] = '00'.repeat(((partes[2] as string).length / 2) | 0);
    expect(() => decrypt(partes.join(':'))).toThrow();
  });
});

describe('esDescifrable', () => {
  it('null/undefined/string vacío → false', () => {
    expect(esDescifrable(null)).toBe(false);
    expect(esDescifrable(undefined)).toBe(false);
    expect(esDescifrable('')).toBe(false);
  });

  it('ciphertext válido → true', () => {
    expect(esDescifrable(encrypt('x'))).toBe(true);
  });

  it('ciphertext corrupto → false (no tira)', () => {
    expect(esDescifrable('basura-no-es-ciphertext')).toBe(false);
  });
});
