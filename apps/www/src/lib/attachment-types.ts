type AttachmentBase = {
  id: string;
  mimeType: string;
  fileType: "image" | "pdf" | "text-file";
  fileName: string;
};

export type Attachment = AttachmentBase &
  (
    | {
        uploadStatus: "pending" | "uploading";
        base64: string;
        file: File;
      }
    | {
        uploadStatus: "completed";
        r2Url: string;
      }
    | {
        uploadStatus: "failed";
        base64: string;
        uploadError: string;
      }
  );

export type UploadStatus = Attachment["uploadStatus"];

export function getFileTypeFromMimeTypeOrNull(
  mimeType: string,
): "image" | "pdf" | "text-file" | null {
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType === "application/pdf") {
    return "pdf";
  }
  if (mimeType === "application/json" || mimeType.startsWith("text/")) {
    return "text-file";
  }
  return null;
}

export function isSupportedAttachmentType(mimeType: string): boolean {
  return !!getFileTypeFromMimeTypeOrNull(mimeType);
}
