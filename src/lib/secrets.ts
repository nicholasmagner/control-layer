import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Encrypts cloud keys before they are stored in the database (AES-256-GCM).
 * The key comes from CONTROLLAYER_SECRET_KEY, which never lives in the
 * database: the desktop app generates and keeps it in its data folder, and
 * server installs set it in their environment.
 */

const PREFIX = 'v1';

function key(): Buffer | null {
  const raw = process.env.CONTROLLAYER_SECRET_KEY?.trim();
  if (!raw) return null;
  return createHash('sha256').update(raw).digest();
}

export function secretsAvailable(): boolean {
  return key() !== null;
}

export function encryptSecret(value: unknown): string {
  const k = key();
  if (!k) throw new Error('CONTROLLAYER_SECRET_KEY is not set, so keys cannot be stored safely.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', k, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [PREFIX, iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

export function decryptSecret<T = unknown>(stored: string): T {
  const k = key();
  if (!k) throw new Error('CONTROLLAYER_SECRET_KEY is not set, so stored keys cannot be read.');
  const [prefix, iv, tag, data] = stored.split('.');
  if (prefix !== PREFIX || !iv || !tag || !data) throw new Error('Stored secret has an unknown format.');
  const decipher = createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  try {
    const plain = Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]);
    return JSON.parse(plain.toString('utf8')) as T;
  } catch {
    throw new Error('Stored keys could not be decrypted. Was CONTROLLAYER_SECRET_KEY changed?');
  }
}
