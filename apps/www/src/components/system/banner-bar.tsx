import { cn } from "@/lib/utils";
import React from "react";

export type BannerVariant = "default" | "warning" | "error" | "info";

export function BannerBar({
  variant = "default",
  children,
  rightSlot,
  className,
  id,
}: {
  variant?: BannerVariant;
  children: React.ReactNode;
  rightSlot?: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        "sticky top-0 z-50 w-full border-b",
        variant === "default" && "bg-muted text-muted-foreground border-border",
        variant === "warning" &&
          "bg-yellow-50 text-yellow-900 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-200 dark:border-yellow-800",
        variant === "error" &&
          "bg-red-50 text-red-900 border-red-300 dark:bg-red-900/20 dark:text-red-200 dark:border-red-800",
        variant === "info" &&
          "bg-sky-50 text-sky-900 border-sky-200 dark:bg-sky-900/20 dark:text-sky-100 dark:border-sky-800",
        className,
      )}
    >
      <div className="flex w-full items-center justify-between gap-3 py-2 px-4 text-sm font-medium">
        <div className="truncate">{children}</div>
        {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
      </div>
    </div>
  );
}
