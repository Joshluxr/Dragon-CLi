/**
 * Storage Handler Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { handleStorageTool } from "./storage.js";

describe("Storage Handler", () => {
  const testBucket = "test-bucket";
  const testKey = "test-file.txt";
  const testContent = "Hello, World!";

  beforeEach(async () => {
    // Clean up by uploading a fresh test file
    await handleStorageTool("UploadFile", {
      bucket: testBucket,
      key: testKey,
      content: testContent,
    });
  });

  describe("UploadFile", () => {
    it("should upload a text file", async () => {
      const result = await handleStorageTool("UploadFile", {
        bucket: testBucket,
        key: "new-file.txt",
        content: "Test content",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);
      expect(content.bucket).toBe(testBucket);
      expect(content.key).toBe("new-file.txt");
      expect(content.url).toContain(testBucket);
    });

    it("should upload a binary file with base64", async () => {
      const base64Content = Buffer.from("binary content").toString("base64");
      const result = await handleStorageTool("UploadFile", {
        bucket: testBucket,
        key: "binary-file.bin",
        content: base64Content,
        isBase64: true,
        contentType: "application/octet-stream",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);
    });

    it("should auto-detect content type", async () => {
      const result = await handleStorageTool("UploadFile", {
        bucket: testBucket,
        key: "image.png",
        content: "fake-image-content",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.contentType).toBe("image/png");
    });

    it("should reject invalid bucket name", async () => {
      const result = await handleStorageTool("UploadFile", {
        bucket: "ab", // Too short
        key: "file.txt",
        content: "test",
      });
      expect(result.isError).toBe(true);

      const content = JSON.parse(result.content[0].text);
      expect(content.error).toContain("Invalid bucket name");
    });

    it("should reject key starting with /", async () => {
      const result = await handleStorageTool("UploadFile", {
        bucket: testBucket,
        key: "/invalid/path.txt",
        content: "test",
      });
      expect(result.isError).toBe(true);

      const content = JSON.parse(result.content[0].text);
      expect(content.error).toContain("Invalid key");
    });
  });

  describe("DownloadFile", () => {
    it("should download a file", async () => {
      const result = await handleStorageTool("DownloadFile", {
        bucket: testBucket,
        key: testKey,
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.content).toBe(testContent);
      expect(content.bucket).toBe(testBucket);
      expect(content.key).toBe(testKey);
    });

    it("should return error for non-existent file", async () => {
      const result = await handleStorageTool("DownloadFile", {
        bucket: testBucket,
        key: "non-existent-file.txt",
      });
      expect(result.isError).toBe(true);

      const content = JSON.parse(result.content[0].text);
      expect(content.error).toContain("File not found");
    });

    it("should return base64 when requested", async () => {
      const result = await handleStorageTool("DownloadFile", {
        bucket: testBucket,
        key: testKey,
        asBase64: true,
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      // Content should be base64 encoded
      const decoded = Buffer.from(content.content, "base64").toString();
      expect(decoded).toBe(testContent);
    });
  });

  describe("ListFiles", () => {
    it("should list files in bucket", async () => {
      const result = await handleStorageTool("ListFiles", {
        bucket: testBucket,
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.bucket).toBe(testBucket);
      expect(content.files).toBeDefined();
      expect(Array.isArray(content.files)).toBe(true);
    });

    it("should filter by prefix", async () => {
      // Upload files with different prefixes
      await handleStorageTool("UploadFile", {
        bucket: testBucket,
        key: "uploads/file1.txt",
        content: "content1",
      });
      await handleStorageTool("UploadFile", {
        bucket: testBucket,
        key: "uploads/file2.txt",
        content: "content2",
      });
      await handleStorageTool("UploadFile", {
        bucket: testBucket,
        key: "other/file3.txt",
        content: "content3",
      });

      const result = await handleStorageTool("ListFiles", {
        bucket: testBucket,
        prefix: "uploads/",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(
        content.files.every((f: { key: string }) =>
          f.key.startsWith("uploads/"),
        ),
      ).toBe(true);
    });

    it("should respect limit", async () => {
      const result = await handleStorageTool("ListFiles", {
        bucket: testBucket,
        limit: 1,
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.files.length).toBeLessThanOrEqual(1);
    });
  });

  describe("DeleteFile", () => {
    it("should delete a file", async () => {
      // First upload a file to delete
      await handleStorageTool("UploadFile", {
        bucket: testBucket,
        key: "to-delete.txt",
        content: "delete me",
      });

      const result = await handleStorageTool("DeleteFile", {
        bucket: testBucket,
        key: "to-delete.txt",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);

      // Verify file is deleted
      const downloadResult = await handleStorageTool("DownloadFile", {
        bucket: testBucket,
        key: "to-delete.txt",
      });
      expect(downloadResult.isError).toBe(true);
    });

    it("should return error for non-existent file", async () => {
      const result = await handleStorageTool("DeleteFile", {
        bucket: testBucket,
        key: "non-existent-file.txt",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("GetSignedUrl", () => {
    it("should generate a signed URL for download", async () => {
      const result = await handleStorageTool("GetSignedUrl", {
        bucket: testBucket,
        key: testKey,
        operation: "get",
        expiresIn: 3600,
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.signedUrl).toBeDefined();
      expect(content.operation).toBe("get");
      expect(content.expiresAt).toBeDefined();
    });

    it("should generate a signed URL for upload", async () => {
      const result = await handleStorageTool("GetSignedUrl", {
        bucket: testBucket,
        key: "new-upload.txt",
        operation: "put",
        contentType: "text/plain",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.signedUrl).toBeDefined();
      expect(content.operation).toBe("put");
    });
  });

  describe("CopyFile", () => {
    it("should copy a file within the same bucket", async () => {
      const result = await handleStorageTool("CopyFile", {
        sourceBucket: testBucket,
        sourceKey: testKey,
        destKey: "copied-file.txt",
      });
      expect(result.isError).toBeUndefined();

      const content = JSON.parse(result.content[0].text);
      expect(content.success).toBe(true);

      // Verify copied file exists
      const downloadResult = await handleStorageTool("DownloadFile", {
        bucket: testBucket,
        key: "copied-file.txt",
      });
      expect(downloadResult.isError).toBeUndefined();
    });

    it("should return error for non-existent source", async () => {
      const result = await handleStorageTool("CopyFile", {
        sourceBucket: testBucket,
        sourceKey: "non-existent.txt",
        destKey: "copy.txt",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("Unknown tool", () => {
    it("should return error for unknown tool", async () => {
      const result = await handleStorageTool("UnknownTool", {});
      expect(result.isError).toBe(true);

      const content = JSON.parse(result.content[0].text);
      expect(content.error).toContain("Unknown storage tool");
    });
  });
});
