"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getGitHubFileContent } from "@/server-actions/github-file-content";
import { ImageLightbox } from "@/components/shared/image-lightbox";
import type { FileChangeType } from "@/lib/git-diff";

interface ImageDiffViewProps {
  fileName: string;
  changeType: FileChangeType;
  repoFullName: string;
  baseBranchName: string;
  headBranchName: string;
}

function useImageContent({
  repoFullName,
  branchName,
  filePath,
  enabled,
}: {
  repoFullName: string;
  branchName: string;
  filePath: string;
  enabled: boolean;
}) {
  return useQuery({
    queryKey: ["github-file-content", repoFullName, branchName, filePath],
    queryFn: async () => {
      const result = await getGitHubFileContent({
        repoFullName,
        branchName,
        filePath,
      });

      if (!result.success || !result.data) {
        return null;
      }

      // Convert base64 to data URL
      const base64Content = result.data.content.replace(/\s/g, "");
      const extension = filePath.split(".").pop()?.toLowerCase() ?? "png";
      const mimeType = getMimeType(extension);
      return `data:${mimeType};base64,${base64Content}`;
    },
    enabled,
    staleTime: Infinity,
    retry: false,
  });
}

function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    bmp: "image/bmp",
    tiff: "image/tiff",
    tif: "image/tiff",
    avif: "image/avif",
  };
  return mimeTypes[extension] || "image/png";
}

function ImagePlaceholder({
  isLoading,
  error,
  label,
}: {
  isLoading: boolean;
  error: Error | null;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-muted/30 rounded-lg min-h-[50px]">
      {isLoading ? (
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      ) : error ? (
        <>
          <ImageOff className="w-8 h-8 text-muted-foreground mb-2" />
          <span className="text-sm text-muted-foreground">
            Failed to load {label}
          </span>
        </>
      ) : (
        <>
          <ImageOff className="w-8 h-8 text-muted-foreground mb-2" />
          <span className="text-sm text-muted-foreground">
            {label} not available
          </span>
        </>
      )}
    </div>
  );
}

function ImagePreview({
  src,
  alt,
  onClick,
  className,
}: {
  src: string;
  alt: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-lg overflow-hidden flex items-center justify-center bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjZjBmMGYwIi8+PHJlY3QgeD0iMTAiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiNmMGYwZjAiLz48L3N2Zz4=')] dark:bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSIjMjAyMDIwIi8+PHJlY3QgeD0iMTAiIHk9IjEwIiB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiMyMDIwMjAiLz48L3N2Zz4=')]",
        className,
      )}
    >
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-[400px] object-contain cursor-pointer hover:opacity-90 transition-opacity"
        onClick={onClick}
      />
    </div>
  );
}

export function ImageDiffView({
  fileName,
  changeType,
  repoFullName,
  baseBranchName,
  headBranchName,
}: ImageDiffViewProps) {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const showOldImage = changeType !== "added";
  const showNewImage = changeType !== "deleted";

  const {
    data: oldImageUrl,
    isLoading: oldLoading,
    error: oldError,
  } = useImageContent({
    repoFullName,
    branchName: baseBranchName,
    filePath: fileName,
    enabled: showOldImage,
  });

  const {
    data: newImageUrl,
    isLoading: newLoading,
    error: newError,
  } = useImageContent({
    repoFullName,
    branchName: headBranchName,
    filePath: fileName,
    enabled: showNewImage,
  });

  const openLightbox = useCallback((url: string) => {
    setLightboxImage(url);
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxImage(null);
  }, []);

  // Get all available images for lightbox navigation
  const allImages = [oldImageUrl, newImageUrl].filter(
    (url): url is string => !!url,
  );
  const currentIndex = lightboxImage ? allImages.indexOf(lightboxImage) : -1;

  if (changeType === "added") {
    return (
      <div className="p-4">
        {newLoading || newError || !newImageUrl ? (
          <ImagePlaceholder
            isLoading={newLoading}
            error={newError as Error | null}
            label="new image"
          />
        ) : (
          <ImagePreview
            src={newImageUrl}
            alt="New image"
            onClick={() => openLightbox(newImageUrl)}
          />
        )}
        <ImageLightbox
          imageUrl={lightboxImage || ""}
          isOpen={!!lightboxImage}
          onClose={closeLightbox}
          images={allImages}
          currentIndex={currentIndex}
          onIndexChange={(index) => setLightboxImage(allImages[index] || null)}
        />
      </div>
    );
  }

  if (changeType === "deleted") {
    return (
      <div className="p-4">
        {oldLoading || oldError || !oldImageUrl ? (
          <ImagePlaceholder
            isLoading={oldLoading}
            error={oldError as Error | null}
            label="deleted image"
          />
        ) : (
          <ImagePreview
            src={oldImageUrl}
            alt="Deleted image"
            onClick={() => openLightbox(oldImageUrl)}
            className="opacity-60"
          />
        )}
        <ImageLightbox
          imageUrl={lightboxImage || ""}
          isOpen={!!lightboxImage}
          onClose={closeLightbox}
          images={allImages}
          currentIndex={currentIndex}
          onIndexChange={(index) => setLightboxImage(allImages[index] || null)}
        />
      </div>
    );
  }

  // Modified image - show side-by-side comparison
  return (
    <div className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Before
          </span>
          {oldLoading || oldError || !oldImageUrl ? (
            <ImagePlaceholder
              isLoading={oldLoading}
              error={oldError as Error | null}
              label="before image"
            />
          ) : (
            <ImagePreview
              src={oldImageUrl}
              alt="Before"
              onClick={() => openLightbox(oldImageUrl)}
            />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            After
          </span>
          {newLoading || newError || !newImageUrl ? (
            <ImagePlaceholder
              isLoading={newLoading}
              error={newError as Error | null}
              label="after image"
            />
          ) : (
            <ImagePreview
              src={newImageUrl}
              alt="After"
              onClick={() => openLightbox(newImageUrl)}
            />
          )}
        </div>
      </div>
      <ImageLightbox
        imageUrl={lightboxImage || ""}
        isOpen={!!lightboxImage}
        onClose={closeLightbox}
        images={allImages}
        currentIndex={currentIndex}
        onIndexChange={(index) => setLightboxImage(allImages[index] || null)}
      />
    </div>
  );
}
