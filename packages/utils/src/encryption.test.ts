import { describe, it, expect } from "vitest";
import {
  encryptValue,
  decryptValue,
  encryptEnvironmentVariables,
  decryptEnvironmentVariables,
  isEncrypted,
  EncryptionError,
} from "./encryption";

describe("encryption utilities", () => {
  const masterKey = "test-master-key-32-characters-long";
  const testValue = "my-secret-value";
  const testEnvVars = {
    API_KEY: "secret-api-key",
    DATABASE_URL: "postgresql://user:pass@localhost/db",
    SECRET_TOKEN: "super-secret-token-123",
  };

  describe("encryptValue", () => {
    it("should encrypt a value successfully", () => {
      const encrypted = encryptValue(testValue, masterKey);
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(testValue);
      expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/); // Base64 pattern
    });

    it("should produce different encrypted values for the same input", () => {
      const encrypted1 = encryptValue(testValue, masterKey);
      const encrypted2 = encryptValue(testValue, masterKey);
      expect(encrypted1).not.toBe(encrypted2); // Due to random salt and IV
    });

    it("should throw error when master key is missing", () => {
      expect(() => encryptValue(testValue, "")).toThrow(EncryptionError);
      expect(() => encryptValue(testValue, "")).toThrow(
        "Master key is required for encryption",
      );
    });

    it("should handle empty values", () => {
      const encrypted = encryptValue("", masterKey);
      expect(encrypted).toBeTruthy();
      const decrypted = decryptValue(encrypted, masterKey);
      expect(decrypted).toBe("");
    });

    it("should handle unicode characters", () => {
      const unicodeValue = "🔐 Unicode test: こんにちは";
      const encrypted = encryptValue(unicodeValue, masterKey);
      const decrypted = decryptValue(encrypted, masterKey);
      expect(decrypted).toBe(unicodeValue);
    });
  });

  describe("decryptValue", () => {
    it("should decrypt a value successfully", () => {
      const encrypted = encryptValue(testValue, masterKey);
      const decrypted = decryptValue(encrypted, masterKey);
      expect(decrypted).toBe(testValue);
    });

    it("should throw error when master key is missing", () => {
      const encrypted = encryptValue(testValue, masterKey);
      expect(() => decryptValue(encrypted, "")).toThrow(EncryptionError);
      expect(() => decryptValue(encrypted, "")).toThrow(
        "Master key is required for decryption",
      );
    });

    it("should throw error for invalid encrypted value", () => {
      expect(() => decryptValue("invalid-base64!@#", masterKey)).toThrow(
        EncryptionError,
      );
      expect(() => decryptValue("dG9vLXNob3J0", masterKey)).toThrow(
        "Invalid encrypted value format",
      );
    });

    it("should throw error when using wrong master key", () => {
      const encrypted = encryptValue(testValue, masterKey);
      const wrongKey = "wrong-master-key-32-characters!!";
      expect(() => decryptValue(encrypted, wrongKey)).toThrow(EncryptionError);
    });

    it("should handle large values", () => {
      const largeValue = "x".repeat(10000);
      const encrypted = encryptValue(largeValue, masterKey);
      const decrypted = decryptValue(encrypted, masterKey);
      expect(decrypted).toBe(largeValue);
    });
  });

  describe("encryptEnvironmentVariables", () => {
    it("should encrypt all environment variables", () => {
      const encrypted = encryptEnvironmentVariables(testEnvVars, masterKey);

      expect(Object.keys(encrypted)).toEqual(Object.keys(testEnvVars));

      for (const [key, value] of Object.entries(encrypted)) {
        expect(value).not.toBe(testEnvVars[key as keyof typeof testEnvVars]);
        expect(isEncrypted(value)).toBe(true);
      }
    });

    it("should handle empty object", () => {
      const encrypted = encryptEnvironmentVariables({}, masterKey);
      expect(encrypted).toEqual({});
    });

    it("should handle single variable", () => {
      const singleVar = { API_KEY: "test-key" };
      const encrypted = encryptEnvironmentVariables(singleVar, masterKey);
      expect(Object.keys(encrypted)).toHaveLength(1);
      expect(encrypted.API_KEY).toBeTruthy();
      expect(encrypted.API_KEY).not.toBe(singleVar.API_KEY);
    });
  });

  describe("decryptEnvironmentVariables", () => {
    it("should decrypt all environment variables", () => {
      const encrypted = encryptEnvironmentVariables(testEnvVars, masterKey);
      const decrypted = decryptEnvironmentVariables(encrypted, masterKey);

      expect(decrypted).toEqual(testEnvVars);
    });

    it("should throw error if any variable fails to decrypt", () => {
      const encrypted = encryptEnvironmentVariables(testEnvVars, masterKey);
      encrypted.API_KEY = "invalid-encrypted-value";

      expect(() => decryptEnvironmentVariables(encrypted, masterKey)).toThrow(
        EncryptionError,
      );
      expect(() => decryptEnvironmentVariables(encrypted, masterKey)).toThrow(
        "Failed to decrypt environment variables",
      );
    });

    it("should handle empty object", () => {
      const decrypted = decryptEnvironmentVariables({}, masterKey);
      expect(decrypted).toEqual({});
    });
  });

  describe("isEncrypted", () => {
    it("should return true for encrypted values", () => {
      const encrypted = encryptValue(testValue, masterKey);
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it("should return false for non-encrypted values", () => {
      expect(isEncrypted("plain-text")).toBe(false);
      expect(isEncrypted("")).toBe(false);
      expect(isEncrypted("too-short")).toBe(false);
    });

    it("should return false for invalid base64", () => {
      expect(isEncrypted("not-base64!@#")).toBe(false);
    });

    it("should handle edge cases", () => {
      // Valid base64 but too short to be encrypted
      const shortBase64 = Buffer.from("short").toString("base64");
      expect(isEncrypted(shortBase64)).toBe(false);

      // Long enough base64
      const longBase64 = Buffer.alloc(65).toString("base64");
      expect(isEncrypted(longBase64)).toBe(true);
    });
  });

  describe("round-trip encryption", () => {
    it("should handle multiple encrypt/decrypt cycles", () => {
      let value = testValue;

      for (let i = 0; i < 5; i++) {
        const encrypted = encryptValue(value, masterKey);
        const decrypted = decryptValue(encrypted, masterKey);
        expect(decrypted).toBe(value);
        value = `${value}-${i}`;
      }
    });

    it("should handle environment variables round-trip", () => {
      const encrypted = encryptEnvironmentVariables(testEnvVars, masterKey);
      const decrypted = decryptEnvironmentVariables(encrypted, masterKey);
      const reEncrypted = encryptEnvironmentVariables(decrypted, masterKey);
      const reDecrypted = decryptEnvironmentVariables(reEncrypted, masterKey);

      expect(reDecrypted).toEqual(testEnvVars);
    });
  });
});
