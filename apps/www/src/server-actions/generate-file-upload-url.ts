"use server";

import { userOnlyAction } from "@/lib/auth-server";
import { UserFacingError } from "@/lib/server-actions";
import {
  FileUploadTypeForClient,
  generateFileUploadUrlForUser,
  isClientSideFileUploadType,
} from "@/server-lib/r2-file-upload";

export type FileUploadType = FileUploadTypeForClient;

export const generateFileUploadUrl = userOnlyAction(
  async function generateFileUploadUrl(
    userId: string,
    {
      fileType,
      contentType,
      sizeInBytes,
    }: {
      fileType: FileUploadType;
      contentType: string;
      sizeInBytes: number;
    },
  ) {
    if (!isClientSideFileUploadType(fileType)) {
      throw new UserFacingError(`File upload type ${fileType} not supported`);
    }
    return generateFileUploadUrlForUser({
      userId,
      fileType,
      contentType,
      sizeInBytes,
    });
  },
  { defaultErrorMessage: "Failed to generate file upload URL" },
);
