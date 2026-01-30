"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { FileCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SkipSetupToggleProps {
  disabled?: boolean;
  disableToast?: boolean;
  value: boolean;
  onChange: (disabled: boolean) => void;
}

export function SkipSetupToggle({
  disabled,
  disableToast,
  value,
  onChange,
}: SkipSetupToggleProps) {
  const skipSetup = value;
  const setupEnabled = !skipSetup;

  return (
    <Button
      variant="ghost"
      size="icon"
      type="button"
      className={cn(
        setupEnabled
          ? "text-muted-foreground hover:text-muted-foreground"
          : "opacity-50 hover:opacity-50",
        "",
      )}
      aria-pressed={setupEnabled}
      aria-label={setupEnabled ? "Skip setup script" : "Run setup script"}
      title={setupEnabled ? "Skip setup script" : "Run setup script"}
      disabled={disabled}
      onClick={() => {
        if (disabled) {
          return;
        }
        if (!disableToast) {
          toast.success(
            skipSetup
              ? "Skip setup script enabled"
              : "Skip setup script disabled",
          );
        }
        onChange(!skipSetup);
      }}
    >
      <FileCog
        className={cn("h-4 w-4", {
          "opacity-50": !setupEnabled,
        })}
      />
    </Button>
  );
}
