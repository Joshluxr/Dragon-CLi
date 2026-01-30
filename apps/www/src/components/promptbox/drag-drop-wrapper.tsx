import React, { useCallback, useState, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FileUp } from "lucide-react";
import { nanoid } from "nanoid/non-secure";
import { Attachment } from "@/lib/attachment-types";
import {
  getFileTypeFromMimeTypeOrNull,
  isSupportedAttachmentType,
} from "@/lib/attachment-types";
import { toast } from "sonner";

interface DragDropWrapperProps {
  children: ReactNode;
  className?: string;
  onFilesDropped: (files: Attachment[]) => void;
  onPaste?: (event: React.ClipboardEvent) => void;
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
}

async function dataTransferItemToAttachedFile(
  item: DataTransferItem,
): Promise<Attachment | undefined> {
  const file = item.getAsFile();
  if (file) {
    const id = nanoid();
    const base64 = await toBase64(file);
    const fileType = getFileTypeFromMimeTypeOrNull(file.type);
    if (!fileType) {
      toast.error(`Sorry, we don't support attaching files of this type`);
      console.error("Unsupported file type:", {
        type: file.type,
        name: file.name,
      });
      return undefined;
    }
    return {
      id,
      mimeType: file.type,
      fileType,
      fileName: file.name,
      base64,
      file,
      uploadStatus: "pending",
    };
  }
  return undefined;
}

export function DragDropWrapper({
  children,
  className,
  onFilesDropped,
  onPaste,
}: DragDropWrapperProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const dragCounter = React.useRef(0);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    const hasFiles = Array.from(event.dataTransfer.types).includes("Files");
    if (hasFiles) {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(true);
    }
  }, []);

  const handleDragEnter = useCallback((event: React.DragEvent) => {
    const hasFiles = Array.from(event.dataTransfer.types).includes("Files");
    if (hasFiles) {
      event.preventDefault();
      event.stopPropagation();
      dragCounter.current++;
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    const hasFiles = Array.from(event.dataTransfer.types).includes("Files");
    if (hasFiles) {
      event.preventDefault();
      event.stopPropagation();
      dragCounter.current--;

      // Only set drag over to false when we've left all elements
      if (dragCounter.current === 0) {
        setIsDragOver(false);
      }
    }
  }, []);

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      const hasFiles = Array.from(event.dataTransfer.types).includes("Files");
      if (hasFiles) {
        event.preventDefault();
        event.stopPropagation();
        setIsDragOver(false);
        dragCounter.current = 0;

        const files = Array.from(event.dataTransfer.files);
        const supportedFiles = files.filter((file) =>
          isSupportedAttachmentType(file.type),
        );

        if (supportedFiles.length === 0) {
          return;
        }

        const newFiles: Attachment[] = await Promise.all(
          supportedFiles
            .map(async (file) => {
              return await dataTransferItemToAttachedFile({
                getAsFile: () => file,
              } as DataTransferItem);
            })
            .filter(Boolean) as Promise<Attachment>[],
        );

        onFilesDropped(newFiles);
      }
    },
    [onFilesDropped],
  );

  const handlePaste = useCallback(
    async (event: React.ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) {
        return;
      }
      const hasSupportedFiles = Array.from(items).some((item) =>
        isSupportedAttachmentType(item.type),
      );
      if (!hasSupportedFiles) {
        return;
      }
      event.preventDefault();
      const newFiles = (
        await Promise.all(
          Array.from(items)
            .filter((item) => isSupportedAttachmentType(item.type))
            .map((item) => dataTransferItemToAttachedFile(item)),
        )
      ).filter(Boolean) as Attachment[];
      if (newFiles.length !== 0) {
        onFilesDropped(newFiles);
      }
    },
    [onFilesDropped],
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full flex flex-col bg-background border border-input rounded-md pb-4 transition-colors",
        {
          "border-primary bg-primary/5": isDragOver,
        },
        className,
      )}
      onDragOverCapture={handleDragOver}
      onDragEnterCapture={handleDragEnter}
      onDragLeaveCapture={handleDragLeave}
      onDropCapture={handleDrop}
      onPaste={onPaste || handlePaste}
    >
      {isDragOver && (
        <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-md flex items-center justify-center z-10 pointer-events-none">
          <div className="text-primary font-medium flex items-center gap-2">
            <FileUp className="size-5" />
            Drop files here (images, PDFs, CSV, Markdown, etc.)
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

// Export the utility functions for use in other components
export { dataTransferItemToAttachedFile };
