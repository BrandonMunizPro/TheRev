import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

export interface EncryptionConfig {
  algorithm: 'aes-256-gcm' | 'aes-128-cbc';
  keyDerivation: 'pbkdf2' | 'scrypt';
  saltLength: number;
  iterations?: number;
}

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag?: string;
  salt: string;
  algorithm: string;
}

export const DEFAULT_ENCRYPTION_CONFIG: EncryptionConfig = {
  algorithm: 'aes-256-gcm',
  keyDerivation: 'scrypt',
  saltLength: 32,
  iterations: 100000,
};

export class CredentialEncryptionService {
  private config: EncryptionConfig;
  private masterKey: Buffer;

  constructor(masterKey: string, config?: Partial<EncryptionConfig>) {
    this.config = { ...DEFAULT_ENCRYPTION_CONFIG, ...config };
    this.masterKey = this.deriveKey(masterKey);
  }

  private deriveKey(password: string): Buffer {
    const salt = Buffer.alloc(this.config.saltLength);
    if (this.config.keyDerivation === 'scrypt') {
      return scryptSync(password, salt, 32);
    }
    return Buffer.alloc(32);
  }

  encrypt(plaintext: string): EncryptedData {
    const iv = randomBytes(16);
    const salt = randomBytes(this.config.saltLength);
    const key = this.deriveFromMaster(salt);

    let ciphertext: Buffer;
    let authTag: string | undefined;

    if (this.config.algorithm === 'aes-256-gcm') {
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      authTag = cipher.getAuthTag().toString('hex');
    } else {
      const cipher = createCipheriv('aes-128-cbc', key.slice(0, 16), iv);
      ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    }

    return {
      ciphertext: ciphertext.toString('hex'),
      iv: iv.toString('hex'),
      authTag,
      salt: salt.toString('hex'),
      algorithm: this.config.algorithm,
    };
  }

  decrypt(encrypted: EncryptedData): string {
    const iv = Buffer.from(encrypted.iv, 'hex');
    const salt = Buffer.from(encrypted.salt, 'hex');
    const ciphertext = Buffer.from(encrypted.ciphertext, 'hex');
    const key = this.deriveFromMaster(salt);

    if (encrypted.algorithm === 'aes-256-gcm' && encrypted.authTag) {
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } else {
      const decipher = createDecipheriv('aes-128-cbc', key.slice(0, 16), iv);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    }
  }

  private deriveFromMaster(salt: Buffer): Buffer {
    return scryptSync(this.masterKey, salt, 32);
  }

  encryptObject<T extends Record<string, unknown>>(obj: T): Record<string, EncryptedData | unknown> {
    const result: Record<string, EncryptedData | unknown> = {};
    const sensitiveFields = ['apiKey', 'password', 'secret', 'token', 'key'];

    for (const [key, value] of Object.entries(obj)) {
      if (sensitiveFields.some(f => key.toLowerCase().includes(f)) && typeof value === 'string') {
        result[key] = this.encrypt(value);
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.encryptObject(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  decryptObject<T extends Record<string, unknown>>(obj: Record<string, EncryptedData | unknown>): T {
    const result: Record<string, unknown> = {};
    const sensitiveFields = ['apiKey', 'password', 'secret', 'token', 'key'];

    for (const [key, value] of Object.entries(obj)) {
      if (this.isEncryptedData(value)) {
        result[key] = this.decrypt(value);
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.decryptObject(value as Record<string, EncryptedData | unknown>);
      } else {
        result[key] = value;
      }
    }

    return result as T;
  }

  private isEncryptedData(value: unknown): value is EncryptedData {
    return (
      typeof value === 'object' &&
      value !== null &&
      'ciphertext' in value &&
      'iv' in value &&
      'salt' in value
    );
  }

  rotateKey(newMasterKey: string, _reEncryptFn: (field: string, ciphertext: string) => Promise<string>): void {
    console.log('[Encryption] Key rotation initiated');
    this.masterKey = this.deriveKey(newMasterKey);
    console.log('[Encryption] Master key rotated');
  }
}

let encryptionServiceInstance: CredentialEncryptionService | null = null;

export function initializeEncryptionService(masterKey: string, config?: Partial<EncryptionConfig>): CredentialEncryptionService {
  encryptionServiceInstance = new CredentialEncryptionService(masterKey, config);
  return encryptionServiceInstance;
}

export function getEncryptionService(): CredentialEncryptionService {
  if (!encryptionServiceInstance) {
    throw new Error('Encryption service not initialized. Call initializeEncryptionService first.');
  }
  return encryptionServiceInstance;
}
