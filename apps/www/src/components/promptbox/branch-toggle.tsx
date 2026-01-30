"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { GitBranchPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function BranchToggle({
  disabled,
  checkpointValue,
  value,
  onChange,
}: {
  disabled?: boolean;
  value: boolean; // true = create new branch
  checkpointValue: boolean; // true = checkpointing disabled
  onChange: (createNewBranch: boolean) => void;
}) {
  const createNewBranch = value;
  return (
    <Button
      variant="ghost"
      size="icon"
      type="button"
      className={cn(
        createNewBranch
          ? "text-muted-foreground hover:text-muted-foreground"
          : "opacity-50 hover:opacity-50",
        "",
      )}
      aria-pressed={createNewBranch}
      aria-label={
        createNewBranch ? "Create new branch" : "Work on selected branch"
      }
      title={createNewBranch ? "Create new branch" : "Work on selected branch"}
      disabled={disabled}
      onClick={() => {
        if (disabled) {
          return;
        }
        if (checkpointValue) {
          toast.error(
            "Cannot create a new branch when checkpointing is disabled",
          );
          return;
        }
        const newValue = !createNewBranch;
        onChange(newValue);
        toast.success(
          newValue
            ? "A new branch will be created for the task"
            : "The selected branch will be used for the task",
        );
      }}
    >
      <GitBranchPlus
        className={cn("h-4 w-4", {
          "opacity-50": !createNewBranch,
        })}
      />
    </Button>
  );
}
