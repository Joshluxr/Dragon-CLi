/**
 * Storage Tools
 *
 * These tools allow AI agents to interact with cloud storage (R2/S3)
 * for file uploads, downloads, and management.
 */

import type { ToolDefinition } from "../types/index.js";

export const storageTools: ToolDefinition[] = [
  {
    name: "UploadFile",
    description: `Upload a file to cloud storage (R2/S3).

Use this when:
- Storing user uploads
- Saving generated artifacts (images, documents, etc.)
- Backing up important files
- Sharing files between sandboxes

IMPORTANT:
- Maximum file size: 100MB
- For binary files, set isBase64: true and encode content
- Use appropriate contentType for proper handling

Returns: url, key, size, and contentType`,
    inputSchema: {
      type: "object",
      properties: {
        bucket: {
          type: "string",
          description:
            "Storage bucket name. Use 'default' for the default bucket.",
        },
        key: {
          type: "string",
          description:
            "File path/key in the bucket (e.g., 'uploads/image.png')",
        },
        content: {
          type: "string",
          description: "File content. For binary files, use base64 encoding.",
        },
        contentType: {
          type: "string",
          description:
            "MIME type of the file (e.g., 'image/png', 'application/json'). Auto-detected if not provided.",
        },
        isBase64: {
          type: "boolean",
          description:
            "Whether content is base64 encoded (for binary files). Default: false",
        },
        metadata: {
          type: "object",
          description: "Custom metadata to attach to the file",
        },
      },
      required: ["bucket", "key", "content"],
    },
  },
  {
    name: "DownloadFile",
    description: `Download a file from cloud storage.

Use this when:
- Retrieving stored files
- Reading configuration files
- Getting assets for processing

Returns: content, contentType, size, and metadata`,
    inputSchema: {
      type: "object",
      properties: {
        bucket: {
          type: "string",
          description: "Storage bucket name",
        },
        key: {
          type: "string",
          description: "File path/key in the bucket",
        },
        asBase64: {
          type: "boolean",
          description:
            "Return content as base64 (for binary files). Default: auto-detect",
        },
      },
      required: ["bucket", "key"],
    },
  },
  {
    name: "ListFiles",
    description: `List files in a storage bucket.

Use this when:
- Browsing bucket contents
- Finding files by prefix
- Checking what files exist

Returns: array of files with key, size, lastModified, and contentType`,
    inputSchema: {
      type: "object",
      properties: {
        bucket: {
          type: "string",
          description: "Storage bucket name",
        },
        prefix: {
          type: "string",
          description: "Filter files by prefix/path (e.g., 'uploads/')",
        },
        limit: {
          type: "number",
          description: "Maximum files to return. Default: 100, Max: 1000",
        },
        cursor: {
          type: "string",
          description: "Pagination cursor from previous response",
        },
      },
      required: ["bucket"],
    },
  },
  {
    name: "DeleteFile",
    description: `Delete a file from cloud storage.

Use this when:
- Removing temporary files
- Cleaning up old uploads
- Freeing storage space

IMPORTANT: This action is irreversible.

Returns: confirmation of deletion`,
    inputSchema: {
      type: "object",
      properties: {
        bucket: {
          type: "string",
          description: "Storage bucket name",
        },
        key: {
          type: "string",
          description: "File path/key to delete",
        },
      },
      required: ["bucket", "key"],
    },
  },
  {
    name: "GetSignedUrl",
    description: `Generate a signed URL for temporary file access.

Use this when:
- Sharing files securely
- Providing download links
- Allowing uploads without exposing credentials

Returns: signedUrl and expiresAt`,
    inputSchema: {
      type: "object",
      properties: {
        bucket: {
          type: "string",
          description: "Storage bucket name",
        },
        key: {
          type: "string",
          description: "File path/key",
        },
        operation: {
          type: "string",
          enum: ["get", "put"],
          description: "'get' for download URL, 'put' for upload URL",
        },
        expiresIn: {
          type: "number",
          description: "URL validity in seconds. Default: 3600 (1 hour)",
        },
        contentType: {
          type: "string",
          description: "Required contentType for 'put' operations",
        },
      },
      required: ["bucket", "key", "operation"],
    },
  },
  {
    name: "CopyFile",
    description: `Copy a file within or between buckets.

Use this when:
- Duplicating files
- Moving files to different paths
- Creating backups

Returns: destination url and key`,
    inputSchema: {
      type: "object",
      properties: {
        sourceBucket: {
          type: "string",
          description: "Source bucket name",
        },
        sourceKey: {
          type: "string",
          description: "Source file path/key",
        },
        destBucket: {
          type: "string",
          description:
            "Destination bucket name. Same as source if not provided.",
        },
        destKey: {
          type: "string",
          description: "Destination file path/key",
        },
      },
      required: ["sourceBucket", "sourceKey", "destKey"],
    },
  },
];

export const storageToolNames = storageTools.map((t) => t.name);
