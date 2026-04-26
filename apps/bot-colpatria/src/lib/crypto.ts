import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Cifrado simétrico para credenciales y cookies del bot Colpatria.
 *
 * **Replicación deliberada de `apps/web/src/lib/colpatria/crypto.ts`** —
 * el bot corre como proceso separado y no debe importar desde apps/web
 * (que es un paquete Next, no una lib consumible). Mantenemos los dos
 * helpers en sincronía para que ambos puedan leer/escribir los mismos
 * registros de BD (`Empresa.colpatriaPasswordEnc`,
 * `ColpatriaSesion.cookiesEnc`).
 *
 * Si cambia algo aquí, replicar en apps/web. Si la divergencia se
 * vuelve dolorosa, mover a `packages/colpatria-crypto`.
 */

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const SALT = 'pila-colpatria-v1';

let cachedKey: Buffer | null = null;

function obtenerKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.COLPATRIA_ENC_KEY;
  if (!raw || raw.length < 16) {
    throw new Error(
      'COLPATRIA_ENC_KEY no configurada o demasiado corta (mín 16 chars). Revisa .env.',
    );
  }
  cachedKey = scryptSync(raw, SALT, 32);
  return cachedKey;
}

export function encrypt(plain: string): string {
  const key = obtenerKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const cifrado = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${cifrado.toString('hex')}`;
}

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
