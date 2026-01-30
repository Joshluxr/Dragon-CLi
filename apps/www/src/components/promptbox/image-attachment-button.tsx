import React, { memo } from "react";
import { Button } from "@/components/ui/button";
import { ImagePlus } from "lucide-react";
import { cn } from "@/lib/utils";

import { dataTransferItemToAttachedFile } from "./drag-drop-wrapper";
import { Attachment } from "@/lib/attachment-types";

interface ImageAttachmentButtonProps {
  className?: string;
  onImageAttachment: (image: Attachment) => void;
}

export const ImageAttachmentButton = memo(function ImageAttachmentButton({
  className,
  onImageAttachment,
}: ImageAttachmentButtonProps) {
  const handleClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      for (const file of files) {
        const image = await dataTransferItemToAttachedFile({
          getAsFile: () => file,
        } as DataTransferItem);
        if (image) {
          onImageAttachment(image);
        }
      }
      input.remove();
    };
    input.click();
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      type="button"
      className={cn("size-8", className)}
      onClick={handleClick}
      title="Attach images"
    >
      <ImagePlus className="size-4" />
    </Button>
  );
});
