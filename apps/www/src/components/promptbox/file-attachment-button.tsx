import React, { memo } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { Attachment } from "@/lib/attachment-types";
import { openFileUploadDialog } from "./utils/file-upload";

interface FileAttachmentButtonProps {
  className?: string;
  onFileAttachment: (file: Attachment) => void;
}

export const FileAttachmentButton = memo(function FileAttachmentButton({
  className,
  onFileAttachment,
}: FileAttachmentButtonProps) {
  const handleClick = () => {
    openFileUploadDialog((files) => {
      files.forEach(onFileAttachment);
    });
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      type="button"
      className={cn("size-8", className)}
      onClick={handleClick}
      title="Attach files (images, PDFs, CSV, Markdown, etc.)"
    >
      <Paperclip className="size-4" />
    </Button>
  );
});
