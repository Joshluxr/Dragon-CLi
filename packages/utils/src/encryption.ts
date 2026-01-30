import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";

const ALGORITHM = "aes-256-gcm";
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export class EncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionError";
  }
}

function deriveKey(masterKey: string, salt: Buffer): Buffer {
  return scryptSync(masterKey, salt, KEY_LENGTH);
}

export function encryptValue(value: string, masterKey: string): string {
  if (!masterKey) {
    throw new EncryptionError("Master key is required for encryption");
  }

  try {
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const key = deriveKey(masterKey, salt);

    const cipher = createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    // Combine salt + iv + tag + encrypted data
    const combined = Buffer.concat([salt, iv, tag, encrypted]);

    return combined.toString("base64");
  } catch (error) {
    throw new EncryptionError(
      `Encryption failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export function decryptValue(
  encryptedValue: string,
  masterKey: string,
): string {
  if (!masterKey) {
    throw new EncryptionError("Master key is required for decryption");
  }

  try {
    const combined = Buffer.from(encryptedValue, "base64");

    if (combined.length < SALT_LENGTH + IV_LENGTH + TAG_LENGTH) {
      throw new EncryptionError("Invalid encrypted value format");
    }

    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = combined.subarray(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + TAG_LENGTH,
    );
    const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    const key = deriveKey(masterKey, salt);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch (error) {
    throw new EncryptionError(
      `Decryption failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

export function encryptEnvironmentVariables(
  variables: Record<string, string>,
  masterKey: string,
): Record<string, string> {
  const encrypted: Record<string, string> = {};

  for (const [key, value] of Object.entries(variables)) {
    encrypted[key] = encryptValue(value, masterKey);
  }

  return encrypted;
}

export function decryptEnvironmentVariables(
  encryptedVariables: Record<string, string>,
  masterKey: string,
): Record<string, string> {
  const decrypted: Record<string, string> = {};

  for (const [key, value] of Object.entries(encryptedVariables)) {
    try {
      decrypted[key] = decryptValue(value, masterKey);
    } catch (error) {
      // Log the error but don't expose which key failed
      console.error("Failed to decrypt environment variable:", error);
      throw new EncryptionError("Failed to decrypt environment variables");
    }
  }

  return decrypted;
}

export function isEncrypted(value: string): boolean {
  try {
    const decoded = Buffer.from(value, "base64");
    return decoded.length >= SALT_LENGTH + IV_LENGTH + TAG_LENGTH;
  } catch {
    return false;
  }
}

/**
 * Check if a string is valid base64
 */
function isValidBase64(str: string): boolean {
  try {
    return Buffer.from(str, "base64").toString("base64") === str;
  } catch {
    return false;
  }
}

/**
 * Encrypt a token using the standard encryption utilities
 */
export function encryptToken(token: string, encryptionKey: string): string {
  return encryptValue(token, encryptionKey);
}

/**
 * Decrypt a token if it's encrypted, otherwise return as-is for backwards compatibility
 */
export function decryptTokenWithBackwardsCompatibility(
  token: string,
  encryptionKey: string,
): string {
  try {
    // First check if it looks like an encrypted value
    // Encrypted values are base64 encoded and have a specific minimum length
    if (isValidBase64(token) && isEncrypted(token)) {
      return decryptValue(token, encryptionKey);
    }
    // If it doesn't look encrypted, return as-is (backwards compatibility)
    return token;
  } catch (error) {
    // If decryption fails for any reason, assume it's an unencrypted token
    console.warn("Failed to decrypt token, assuming it's unencrypted:", error);
    return token;
  }
}
