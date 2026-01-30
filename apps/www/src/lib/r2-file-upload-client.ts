import {
  FileUploadType,
  generateFileUploadUrl,
} from "@/server-actions/generate-file-upload-url";
import { unwrapResult } from "@/lib/server-actions";
import { Attachment } from "@/lib/attachment-types";

export interface UploadResult {
  r2Key: string;
  r2Url: string;
}

export async function uploadFileToR2({
  file,
  fileType,
}: {
  file: File;
  fileType: FileUploadType;
}): Promise<UploadResult> {
  // Generate presigned URL
  const { presignedUrl, r2Key, publicUrl } = unwrapResult(
    await generateFileUploadUrl({
      fileType,
      contentType: file.type,
      sizeInBytes: file.size,
    }),
  );
  // Upload directly to R2
  const uploadResponse = await fetch(presignedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
    },
    body: file,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Upload failed: ${await uploadResponse.text()}`);
  }
  if (!publicUrl) {
    throw new Error("No public URL found");
  }
  return { r2Key, r2Url: publicUrl };
}
export async function uploadAudioToR2(file: File): Promise<{
  r2Key: string;
  r2Url: string;
}> {
  return uploadFileToR2({ file, fileType: "audio" });
}

export async function uploadImageToR2(file: File): Promise<{
  r2Key: string;
  r2Url: string;
}> {
  return uploadFileToR2({ file, fileType: "image" });
}

export async function uploadPdfToR2(file: File): Promise<{
  r2Key: string;
  r2Url: string;
}> {
  return uploadFileToR2({ file, fileType: "pdf" });
}

export async function uploadTextFileToR2(file: File): Promise<{
  r2Key: string;
  r2Url: string;
}> {
  return uploadFileToR2({ file, fileType: "text-file" });
}

export async function processAttachedImageForUpload(
  image: Attachment,
): Promise<Attachment> {
  if (image.uploadStatus !== "pending") {
    return image;
  }
  const { file, ...restAttachment } = image;
  try {
    const { r2Url } = await uploadImageToR2(file);
    return {
      ...restAttachment,
      r2Url,
      uploadStatus: "completed",
    };
  } catch (error) {
    console.error("Failed to upload image to R2:", error);
    // Fall back to base64 if upload fails
    return {
      ...restAttachment,
      uploadStatus: "failed",
      uploadError: error instanceof Error ? error.message : "Upload failed",
    };
  }
}
