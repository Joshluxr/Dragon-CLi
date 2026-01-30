/**
 * Storage Handler
 *
 * Handles storage-related MCP tool calls for cloud storage (R2/S3).
 * In production, connects to the R2 package.
 * For standalone mode, provides simulated responses.
 */

import type {
  ToolResult,
  UploadFileArgs,
  DownloadFileArgs,
  ListFilesArgs,
  DeleteFileArgs,
} from "../types/index.js";

// Simulated storage state
const storageFiles = new Map<
  string,
  {
    bucket: string;
    key: string;
    content: string;
    contentType: string;
    size: number;
    lastModified: Date;
    metadata?: Record<string, string>;
  }
>();

/**
 * Generate storage key for internal map
 */
function getStorageKey(bucket: string, key: string): string {
  return `${bucket}/${key}`;
}

/**
 * Detect MIME type from file extension
 */
function detectContentType(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    json: "application/json",
    js: "application/javascript",
    ts: "text/typescript",
    html: "text/html",
    css: "text/css",
    txt: "text/plain",
    md: "text/markdown",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    zip: "application/zip",
  };
  return mimeTypes[ext || ""] || "application/octet-stream";
}

/**
 * Upload file to storage
 */
export async function handleUploadFile(
  args: UploadFileArgs,
): Promise<ToolResult> {
  const {
    bucket,
    key,
    content,
    contentType,
    isBase64 = false,
    metadata,
  } = args as unknown as UploadFileArgs & { metadata?: Record<string, string> };

  // Validate bucket
  if (!bucket || bucket.length < 3) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Invalid bucket name. Must be at least 3 characters.",
          }),
        },
      ],
      isError: true,
    };
  }

  // Validate key
  if (!key || key.startsWith("/")) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Invalid key. Must not start with '/'.",
          }),
        },
      ],
      isError: true,
    };
  }

  // Calculate size
  const size = isBase64
    ? Math.ceil((content.length * 3) / 4) // Base64 to bytes
    : Buffer.byteLength(content);

  // Check size limit (100MB)
  if (size > 100 * 1024 * 1024) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "File too large. Maximum size is 100MB.",
          }),
        },
      ],
      isError: true,
    };
  }

  const detectedType = contentType || detectContentType(key);
  const storageId = getStorageKey(bucket, key);

  // Store file
  storageFiles.set(storageId, {
    bucket,
    key,
    content,
    contentType: detectedType,
    size,
    lastModified: new Date(),
    metadata,
  });

  // In production:
  // await r2Service.upload(bucket, key, content, { contentType, isBase64, metadata });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          bucket,
          key,
          url: `https://${bucket}.r2.terragon.dev/${key}`,
          size,
          contentType: detectedType,
          message: `File uploaded successfully: ${key}`,
        }),
      },
    ],
  };
}

/**
 * Download file from storage
 */
export async function handleDownloadFile(
  args: DownloadFileArgs,
): Promise<ToolResult> {
  const { bucket, key, asBase64 = false } = args;

  const storageId = getStorageKey(bucket, key);
  const file = storageFiles.get(storageId);

  if (!file) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `File not found: ${bucket}/${key}`,
          }),
        },
      ],
      isError: true,
    };
  }

  // In production:
  // const content = await r2Service.download(bucket, key, { asBase64 });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          bucket,
          key,
          content: asBase64
            ? Buffer.from(file.content).toString("base64")
            : file.content,
          contentType: file.contentType,
          size: file.size,
          lastModified: file.lastModified.toISOString(),
          metadata: file.metadata,
        }),
      },
    ],
  };
}

/**
 * List files in bucket
 */
export async function handleListFiles(
  args: ListFilesArgs,
): Promise<ToolResult> {
  const {
    bucket,
    prefix = "",
    limit = 100,
    cursor,
  } = args as unknown as ListFilesArgs & {
    cursor?: string;
  };

  // Filter files by bucket and prefix
  const files = Array.from(storageFiles.values())
    .filter((f) => f.bucket === bucket && f.key.startsWith(prefix))
    .sort((a, b) => a.key.localeCompare(b.key));

  // Apply pagination
  let startIndex = 0;
  if (cursor) {
    startIndex = files.findIndex((f) => f.key === cursor) + 1;
  }

  const pageFiles = files.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < files.length;

  // In production:
  // const result = await r2Service.list(bucket, { prefix, limit, cursor });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          bucket,
          prefix,
          files: pageFiles.map((f) => ({
            key: f.key,
            size: f.size,
            contentType: f.contentType,
            lastModified: f.lastModified.toISOString(),
          })),
          count: pageFiles.length,
          hasMore,
          nextCursor: hasMore
            ? pageFiles[pageFiles.length - 1]?.key
            : undefined,
        }),
      },
    ],
  };
}

/**
 * Delete file from storage
 */
export async function handleDeleteFile(
  args: DeleteFileArgs,
): Promise<ToolResult> {
  const { bucket, key } = args;

  const storageId = getStorageKey(bucket, key);
  const existed = storageFiles.has(storageId);

  if (!existed) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `File not found: ${bucket}/${key}`,
          }),
        },
      ],
      isError: true,
    };
  }

  storageFiles.delete(storageId);

  // In production:
  // await r2Service.delete(bucket, key);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          bucket,
          key,
          message: `File deleted successfully: ${key}`,
        }),
      },
    ],
  };
}

/**
 * Get signed URL for file access
 */
export async function handleGetSignedUrl(args: {
  bucket: string;
  key: string;
  operation: "get" | "put";
  expiresIn?: number;
  contentType?: string;
}): Promise<ToolResult> {
  const { bucket, key, operation, expiresIn = 3600, contentType } = args;

  // Validate operation
  if (!["get", "put"].includes(operation)) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Invalid operation. Must be 'get' or 'put'.",
          }),
        },
      ],
      isError: true,
    };
  }

  // For put operations, contentType is recommended
  if (operation === "put" && !contentType) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            warning:
              "contentType not specified for put operation. This may cause issues.",
          }),
        },
      ],
    };
  }

  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  // In production:
  // const url = await r2Service.getSignedUrl(bucket, key, { operation, expiresIn, contentType });

  // Simulated signed URL
  const token = Buffer.from(`${bucket}:${key}:${expiresAt.getTime()}`).toString(
    "base64",
  );
  const signedUrl = `https://${bucket}.r2.terragon.dev/${key}?token=${token}&expires=${expiresAt.getTime()}`;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          signedUrl,
          bucket,
          key,
          operation,
          expiresAt: expiresAt.toISOString(),
          expiresIn,
        }),
      },
    ],
  };
}

/**
 * Copy file within or between buckets
 */
export async function handleCopyFile(args: {
  sourceBucket: string;
  sourceKey: string;
  destBucket?: string;
  destKey: string;
}): Promise<ToolResult> {
  const { sourceBucket, sourceKey, destBucket = sourceBucket, destKey } = args;

  const sourceId = getStorageKey(sourceBucket, sourceKey);
  const sourceFile = storageFiles.get(sourceId);

  if (!sourceFile) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Source file not found: ${sourceBucket}/${sourceKey}`,
          }),
        },
      ],
      isError: true,
    };
  }

  // Copy to destination
  const destId = getStorageKey(destBucket, destKey);
  storageFiles.set(destId, {
    ...sourceFile,
    bucket: destBucket,
    key: destKey,
    lastModified: new Date(),
  });

  // In production:
  // await r2Service.copy(sourceBucket, sourceKey, destBucket, destKey);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          source: { bucket: sourceBucket, key: sourceKey },
          destination: { bucket: destBucket, key: destKey },
          url: `https://${destBucket}.r2.terragon.dev/${destKey}`,
          message: "File copied successfully.",
        }),
      },
    ],
  };
}

/**
 * Route storage tool calls
 */
export async function handleStorageTool(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case "UploadFile":
      return handleUploadFile(args as unknown as UploadFileArgs);
    case "DownloadFile":
      return handleDownloadFile(args as unknown as DownloadFileArgs);
    case "ListFiles":
      return handleListFiles(args as unknown as ListFilesArgs);
    case "DeleteFile":
      return handleDeleteFile(args as unknown as DeleteFileArgs);
    case "GetSignedUrl":
      return handleGetSignedUrl(
        args as {
          bucket: string;
          key: string;
          operation: "get" | "put";
          expiresIn?: number;
          contentType?: string;
        },
      );
    case "CopyFile":
      return handleCopyFile(
        args as {
          sourceBucket: string;
          sourceKey: string;
          destBucket?: string;
          destKey: string;
        },
      );
    default:
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: `Unknown storage tool: ${name}` }),
          },
        ],
        isError: true,
      };
  }
}
