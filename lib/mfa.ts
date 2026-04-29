// MFA TOTP Utilities - Encryption, generation, verification
import crypto from 'crypto';
import * as otplib from 'otplib';
import bcrypt from 'bcryptjs';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.MFA_ENCRYPTION_KEY;
  if (!key) throw new Error('MFA_ENCRYPTION_KEY not configured');
  return Buffer.from(key, 'hex');
}

export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptSecret(ciphertext: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encrypted] = ciphertext.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function generateTOTPSecret(): string {
  return otplib.generateSecret();
}

export function generateTOTPUri(secret: string, email: string): string {
  return otplib.generateURI({
    secret,
    issuer: 'Winner Tecnologia',
    label: email,
    strategy: 'totp',
  });
}

export function verifyTOTP(token: string, secret: string): boolean {
  try {
    const result = otplib.verifySync({ token, secret });
    return result?.valid === true;
  } catch {
    return false;
  }
}

export function generateBackupCodes(count: number = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // Generate 8-char alphanumeric codes
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map(code => bcrypt.hash(code.replace(/-/g, ''), 10)));
}

export async function verifyBackupCode(code: string, hashedCodes: string[]): Promise<number> {
  const normalized = code.replace(/-/g, '').toUpperCase();
  for (let i = 0; i < hashedCodes.length; i++) {
    if (await bcrypt.compare(normalized, hashedCodes[i])) {
      return i;
    }
  }
  return -1;
}

// Rate limiting: check if user is locked
export function isUserMfaLocked(lockedUntil: Date | null): boolean {
  if (!lockedUntil) return false;
  return new Date() < new Date(lockedUntil);
}

// Calculate lock duration based on failed attempts
export function getMfaLockDuration(failedAttempts: number): number {
  // Progressive lockout: 1min, 5min, 15min, 30min, 1hr
  const durations = [60, 300, 900, 1800, 3600];
  const idx = Math.min(Math.floor(failedAttempts / 3) - 1, durations.length - 1);
  return idx >= 0 ? durations[idx] : 0;
}
