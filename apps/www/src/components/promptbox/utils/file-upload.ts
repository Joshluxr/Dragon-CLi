import { Attachment } from "@/lib/attachment-types";
import { dataTransferItemToAttachedFile } from "../drag-drop-wrapper";

export async function openFileUploadDialog(
  onFilesSelected: (files: Attachment[]) => void,
  options: {
    accept?: string;
    multiple?: boolean;
  } = {},
) {
  const { accept = "*/*", multiple = true } = options;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.multiple = multiple;

  input.onchange = async (e) => {
    const files = Array.from((e.target as HTMLInputElement).files || []);
    const attachedFiles: Attachment[] = [];

    for (const file of files) {
      try {
        const attachedFile = await dataTransferItemToAttachedFile({
          getAsFile: () => file,
        } as DataTransferItem);
        if (attachedFile) {
          attachedFiles.push(attachedFile);
        }
      } catch (error) {
        console.error("Unsupported file type:", file.type);
      }
    }

    if (attachedFiles.length > 0) {
      onFilesSelected(attachedFiles);
    }

    input.remove();
  };

  input.click();
}
