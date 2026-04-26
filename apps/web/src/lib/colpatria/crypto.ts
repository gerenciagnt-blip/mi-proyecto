import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Cifrado simétrico para credenciales del bot Colpatria ARL.
 *
 * - Algoritmo: AES-256-GCM (autenticado, resistente a tampering).
 * - Clave: derivada de `COLPATRIA_ENC_KEY` del env vía scrypt (no se usa
 *   la string cruda como key — scrypt nos da 32 bytes determinísticos).
 * - Cada cifrado usa IV aleatorio de 12 bytes (estándar GCM).
 *
 * Formato del ciphertext exportado:
 *   `${ivHex}:${authTagHex}:${cipherHex}`
 * Eso lo guardamos como string en BD.
 *
 * **Importante:** si rotás `COLPATRIA_ENC_KEY` en el env, los registros
 * encriptados antes ya no se podrán descifrar. Tenés que reingresarlos.
 * Por eso este secret debe quedar fijo y, en producción, en un manager
 * de secretos (Vercel/Doppler/etc.).
 */

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const SALT = 'pila-colpatria-v1'; // estable y público — el secret real está en COLPATRIA_ENC_KEY

let cachedKey: Buffer | null = null;

function obtenerKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.COLPATRIA_ENC_KEY;
  if (!raw || raw.length < 16) {
    throw new Error(
      'COLPATRIA_ENC_KEY no configurada o demasiado corta (mín 16 chars). Revisa .env.',
    );
  }
  // scrypt nos da una key determinística de 32 bytes a partir del secret.
  cachedKey = scryptSync(raw, SALT, 32);
  return cachedKey;
}

/**
 * Encripta un valor (string UTF-8) y devuelve el ciphertext serializado.
 * Sirve tanto para passwords como para JSON (cookies de sesión).
 */
export function encrypt(plain: string): string {
  const key = obtenerKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const cifrado = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${cifrado.toString('hex')}`;
}

/**
 * Descifra un ciphertext del formato producido por `encrypt()`.
 * Tira si el formato es inválido o el authTag no coincide (tampering).
 */
export function decrypt(serialized: string): string {
  const partes = serialized.split(':');
  if (partes.length !== 3) {
    throw new Error('Formato de ciphertext inválido');
  }
  const [ivHex, authTagHex, cipherHex] = partes as [string, string, string];

  const key = obtenerKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const cifrado = Buffer.from(cipherHex, 'hex');

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plano = Buffer.concat([decipher.update(cifrado), decipher.final()]);
  return plano.toString('utf8');
}

/**
 * Verifica que el ciphertext sigue siendo descifrable (útil para
 * detectar rotaciones de key sin migración). No expone el plaintext.
 */
export function esDescifrable(serialized: string | null | undefined): boolean {
  if (!serialized) return false;
  try {
    decrypt(serialized);
    return true;
  } catch {
    return false;
  }
}
