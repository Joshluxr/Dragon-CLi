"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ClipboardList, Zap, Bot } from "lucide-react";
import type { AgentMode } from "@dragon/shared";
import { updateAgentModeAction } from "@/server-actions/plan-approval";
import { cn } from "@/lib/utils";

interface ModeToggleProps {
  threadId: string;
  chatId?: string;
  currentMode: AgentMode;
  disabled?: boolean;
  onModeChange?: (mode: AgentMode) => void;
}

export function ModeToggle({
  threadId,
  chatId,
  currentMode,
  disabled,
  onModeChange,
}: ModeToggleProps) {
  const handleModeChange = async (newMode: AgentMode) => {
    if (newMode === currentMode) return;

    try {
      const result = await updateAgentModeAction({
        threadId,
        chatId,
        mode: newMode,
      });

      if (result.errorMessage) {
        toast.error(result.errorMessage);
        return;
      }

      onModeChange?.(newMode);

      const modeLabels: Record<AgentMode, string> = {
        auto: "Auto mode",
        plan: "Plan First mode",
        act: "Act Now mode",
      };
      toast.success(`Switched to ${modeLabels[newMode]}`);
    } catch {
      toast.error("Failed to update mode");
    }
  };

  const modes: {
    value: AgentMode;
    label: string;
    icon: typeof Bot;
    tooltip: string;
  }[] = [
    {
      value: "auto",
      label: "Auto",
      icon: Bot,
      tooltip: "Agent decides when to plan vs execute",
    },
    {
      value: "plan",
      label: "Plan",
      icon: ClipboardList,
      tooltip: "Agent creates a plan for approval before executing",
    },
    {
      value: "act",
      label: "Act",
      icon: Zap,
      tooltip: "Agent executes immediately without planning",
    },
  ];

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">Mode:</span>
      <div className="flex rounded-md border">
        {modes.map(({ value, label, icon: Icon, tooltip }) => (
          <Tooltip key={value}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => handleModeChange(value)}
                className={cn(
                  "h-7 px-2 rounded-none first:rounded-l-md last:rounded-r-md border-0",
                  currentMode === value && "bg-muted",
                )}
              >
                <Icon className="h-3 w-3 mr-1" />
                {label}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{tooltip}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
