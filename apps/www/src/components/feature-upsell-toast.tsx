"use client";

import { useEffect, useMemo, useState } from "react";
import { useAtom } from "jotai";
import { lastSeenFeatureUpsellVersionAtom } from "@/atoms/user-flags";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { FEATURE_UPSELL_VERSION } from "@/lib/constants";
import { CURRENT_FEATURE_UPSELL } from "@/lib/feature-upsell";
import { X } from "lucide-react";

export function FeatureUpsellToast() {
  const [lastSeen, setLastSeen] = useAtom(lastSeenFeatureUpsellVersionAtom);
  const [open, setOpen] = useState(false);
  const isSmallScreen = useMediaQuery("(max-width: 640px)", {
    initialValue:
      typeof window === "undefined"
        ? false
        : window.matchMedia("(max-width: 640px)").matches,
  });

  const shouldShow = useMemo(() => {
    // Show to first-time users and to users whose last seen is behind
    return lastSeen === null || lastSeen < FEATURE_UPSELL_VERSION;
  }, [lastSeen]);

  useEffect(() => {
    if (isSmallScreen) {
      if (open) {
        setOpen(false);
      }
      return;
    }
    if (open) return; // Don't toggle once opened
    if (shouldShow) {
      // Open once; do NOT persist as seen until user dismisses
      setOpen(true);
    }
  }, [shouldShow, open, isSmallScreen]);

  if (!open || isSmallScreen || !CURRENT_FEATURE_UPSELL) return null;

  return (
    <div
      role="dialog"
      aria-label="Feature update"
      className="fixed bottom-4 right-4 z-50 w-[360px] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg ring-1 ring-black/5"
    >
      {CURRENT_FEATURE_UPSELL.imageUrl ? (
        <div className="relative">
          <img
            src={CURRENT_FEATURE_UPSELL.imageUrl}
            alt={CURRENT_FEATURE_UPSELL.title}
            className="aspect-[16/9] w-full object-cover"
          />
          <button
            aria-label="Close"
            className="absolute right-2 top-2 rounded-md bg-popover/90 p-1.5 text-muted-foreground backdrop-blur-sm hover:bg-popover"
            onClick={() => {
              setOpen(false);
              setLastSeen();
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
      <div className="p-4">
        <div className="flex items-start gap-2">
          <div className="text-sm font-semibold leading-tight">
            {CURRENT_FEATURE_UPSELL.title}
          </div>
          {!CURRENT_FEATURE_UPSELL.imageUrl ? (
            <button
              aria-label="Close"
              className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              onClick={() => {
                setOpen(false);
                setLastSeen();
              }}
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
          {CURRENT_FEATURE_UPSELL.lines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-start">
          {CURRENT_FEATURE_UPSELL.ctaUrl ? (
            <a
              href={CURRENT_FEATURE_UPSELL.ctaUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
              onClick={() => {
                setOpen(false);
                setLastSeen();
              }}
            >
              {CURRENT_FEATURE_UPSELL.ctaText ?? "Read more"} →
            </a>
          ) : (
            <span />
          )}
        </div>
      </div>
    </div>
  );
}
