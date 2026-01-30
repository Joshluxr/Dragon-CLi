"use client";

import { useState, useEffect } from "react";
import {
  Bot,
  Play,
  Square,
  Settings,
  CheckCircle,
  AlertCircle,
  Clock,
  Zap,
  DollarSign,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type {
  AutonomousConfig,
  AutonomousExecutionStatus,
  CompletionSignal,
} from "@dragon/shared/model/autonomous";
import { defaultAutonomousConfig } from "@dragon/shared/model/autonomous";

interface AutonomousExecution {
  id: string;
  status: AutonomousExecutionStatus;
  startedAt: Date;
  lastActivityAt: Date;
  loopCount: number;
  toolCallCount: number;
  tokensUsed: number;
  estimatedCost: string;
  completionSignals: CompletionSignal[];
  config: AutonomousConfig;
}

interface AutonomousControlsProps {
  autonomousMode: boolean;
  execution: AutonomousExecution | null;
  onToggleAutonomous: (enabled: boolean) => void;
  onStartAutonomous: (config: AutonomousConfig) => void;
  onStopAutonomous: () => void;
  disabled?: boolean;
}

function formatDuration(startDate: Date): string {
  const now = Date.now();
  const start = new Date(startDate).getTime();
  const diffMs = now - start;
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffSeconds = Math.floor((diffMs % 60000) / 1000);

  if (diffMinutes > 0) {
    return `${diffMinutes}m ${diffSeconds}s`;
  }
  return `${diffSeconds}s`;
}

function getStatusBadgeVariant(
  status: AutonomousExecutionStatus,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "running":
      return "default";
    case "completed":
      return "secondary";
    case "failed":
    case "timeout":
      return "destructive";
    case "stopped":
      return "outline";
    default:
      return "default";
  }
}

function CompletionSignalDisplay({ signal }: { signal: CompletionSignal }) {
  const getIcon = () => {
    switch (signal.type) {
      case "explicit":
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case "pr_created":
        return <Zap className="h-3 w-3 text-blue-500" />;
      case "tests_passed":
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case "build_success":
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case "user_stop":
        return <Square className="h-3 w-3 text-orange-500" />;
      case "timeout":
        return <Clock className="h-3 w-3 text-yellow-500" />;
      case "limit_reached":
        return <AlertCircle className="h-3 w-3 text-yellow-500" />;
      case "error":
        return <AlertCircle className="h-3 w-3 text-red-500" />;
      default:
        return <CheckCircle className="h-3 w-3" />;
    }
  };

  const getLabel = () => {
    switch (signal.type) {
      case "explicit":
        return "Task Completed";
      case "pr_created":
        return "PR Created";
      case "tests_passed":
        return "Tests Passed";
      case "build_success":
        return "Build Success";
      case "user_stop":
        return "Stopped by User";
      case "timeout":
        return "Timeout";
      case "limit_reached":
        return "Limit Reached";
      case "error":
        return "Error";
      default:
        return signal.type;
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      {getIcon()}
      <span>{getLabel()}</span>
      {signal.details && (
        <span className="text-muted-foreground truncate max-w-[150px]">
          - {signal.details}
        </span>
      )}
    </div>
  );
}

function AutonomousConfigPanel({
  config,
  onChange,
}: {
  config: AutonomousConfig;
  onChange: (config: AutonomousConfig) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configuration
          </div>
          <RefreshCw
            className={cn(
              "h-4 w-4 transition-transform",
              isOpen && "rotate-180",
            )}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-4">
        {/* Limits */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Limits</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Max Duration (min)</Label>
              <Input
                type="number"
                value={config.maxDurationMinutes}
                onChange={(e) =>
                  onChange({
                    ...config,
                    maxDurationMinutes: parseInt(e.target.value) || 60,
                  })
                }
                min={1}
                max={480}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max Loops</Label>
              <Input
                type="number"
                value={config.maxLoops}
                onChange={(e) =>
                  onChange({
                    ...config,
                    maxLoops: parseInt(e.target.value) || 10,
                  })
                }
                min={1}
                max={100}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max Tool Calls</Label>
              <Input
                type="number"
                value={config.maxToolCalls}
                onChange={(e) =>
                  onChange({
                    ...config,
                    maxToolCalls: parseInt(e.target.value) || 200,
                  })
                }
                min={10}
                max={1000}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Max Cost ($)</Label>
              <Input
                type="number"
                value={config.maxCostDollars}
                onChange={(e) =>
                  onChange({
                    ...config,
                    maxCostDollars: parseFloat(e.target.value) || 10,
                  })
                }
                min={0.1}
                max={100}
                step={0.1}
              />
            </div>
          </div>
        </div>

        {/* Exit Conditions */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Exit Conditions</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Require explicit signal</Label>
              <Switch
                checked={config.requireExplicitSignal}
                onCheckedChange={(checked) =>
                  onChange({ ...config, requireExplicitSignal: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Exit on PR created</Label>
              <Switch
                checked={config.exitOnPRCreated}
                onCheckedChange={(checked) =>
                  onChange({ ...config, exitOnPRCreated: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Exit on tests pass</Label>
              <Switch
                checked={config.exitOnTestsPass}
                onCheckedChange={(checked) =>
                  onChange({ ...config, exitOnTestsPass: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Exit on build success</Label>
              <Switch
                checked={config.exitOnBuildSuccess}
                onCheckedChange={(checked) =>
                  onChange({ ...config, exitOnBuildSuccess: checked })
                }
              />
            </div>
          </div>
        </div>

        {/* Error Handling */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Error Handling</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Max consecutive errors</Label>
              <Input
                type="number"
                value={config.maxConsecutiveErrors}
                onChange={(e) =>
                  onChange({
                    ...config,
                    maxConsecutiveErrors: parseInt(e.target.value) || 3,
                  })
                }
                min={1}
                max={10}
                className="w-20"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Retry on error</Label>
              <Switch
                checked={config.retryOnError}
                onCheckedChange={(checked) =>
                  onChange({ ...config, retryOnError: checked })
                }
              />
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AutonomousControls({
  autonomousMode,
  execution,
  onToggleAutonomous,
  onStartAutonomous,
  onStopAutonomous,
  disabled = false,
}: AutonomousControlsProps) {
  const [config, setConfig] = useState<AutonomousConfig>(
    defaultAutonomousConfig,
  );
  const [elapsedTime, setElapsedTime] = useState("");

  // Update elapsed time every second when running
  useEffect(() => {
    if (execution?.status === "running") {
      const interval = setInterval(() => {
        setElapsedTime(formatDuration(execution.startedAt));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [execution?.status, execution?.startedAt]);

  const handleToggle = (enabled: boolean) => {
    if (enabled && !execution) {
      onStartAutonomous(config);
    } else if (!enabled && execution?.status === "running") {
      onStopAutonomous();
    }
    onToggleAutonomous(enabled);
  };

  const progressPercent = execution
    ? Math.min(
        100,
        Math.max(
          ((Date.now() - new Date(execution.startedAt).getTime()) /
            (execution.config.maxDurationMinutes * 60000)) *
            100,
          (execution.loopCount / execution.config.maxLoops) * 100,
          (execution.toolCallCount / execution.config.maxToolCalls) * 100,
        ),
      )
    : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5" />
            Autonomous Mode
          </CardTitle>
          <Switch
            checked={autonomousMode}
            onCheckedChange={handleToggle}
            disabled={disabled}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {execution && execution.status === "running" ? (
          <>
            {/* Status */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge variant={getStatusBadgeVariant(execution.status)}>
                {execution.status}
              </Badge>
            </div>

            {/* Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Running for {elapsedTime}</span>
                <span>{progressPercent.toFixed(0)}%</span>
              </div>
              <Progress value={progressPercent} />
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center justify-between bg-muted/50 p-2 rounded">
                <span className="text-muted-foreground">Loops</span>
                <span>
                  {execution.loopCount}/{execution.config.maxLoops}
                </span>
              </div>
              <div className="flex items-center justify-between bg-muted/50 p-2 rounded">
                <span className="text-muted-foreground">Tools</span>
                <span>
                  {execution.toolCallCount}/{execution.config.maxToolCalls}
                </span>
              </div>
              <div className="flex items-center justify-between bg-muted/50 p-2 rounded">
                <span className="text-muted-foreground">Tokens</span>
                <span>{execution.tokensUsed.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between bg-muted/50 p-2 rounded">
                <DollarSign className="h-3 w-3 text-muted-foreground" />
                <span>${parseFloat(execution.estimatedCost).toFixed(2)}</span>
              </div>
            </div>

            {/* Completion Signals */}
            {execution.completionSignals.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Completion Signals</h4>
                <div className="space-y-1">
                  {execution.completionSignals.map((signal, i) => (
                    <CompletionSignalDisplay key={i} signal={signal} />
                  ))}
                </div>
              </div>
            )}

            {/* Stop Button */}
            <Button
              variant="destructive"
              className="w-full"
              onClick={onStopAutonomous}
            >
              <Square className="h-4 w-4 mr-2" />
              Stop Autonomous Execution
            </Button>
          </>
        ) : execution ? (
          // Completed execution summary
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge variant={getStatusBadgeVariant(execution.status)}>
                {execution.status}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              Completed {execution.loopCount} loops, used{" "}
              {execution.tokensUsed.toLocaleString()} tokens, cost $
              {parseFloat(execution.estimatedCost).toFixed(2)}
            </div>
            {execution.completionSignals.length > 0 && (
              <div className="space-y-1">
                {execution.completionSignals.map((signal, i) => (
                  <CompletionSignalDisplay key={i} signal={signal} />
                ))}
              </div>
            )}
            <Button
              className="w-full"
              onClick={() => onStartAutonomous(config)}
              disabled={disabled}
            >
              <Play className="h-4 w-4 mr-2" />
              Start New Execution
            </Button>
          </div>
        ) : (
          // Configuration panel when not running
          <>
            <p className="text-sm text-muted-foreground">
              Enable autonomous mode to let the agent work continuously without
              intervention. The agent will self-correct and signal when the task
              is complete.
            </p>
            <AutonomousConfigPanel config={config} onChange={setConfig} />
            <Button
              className="w-full"
              onClick={() => onStartAutonomous(config)}
              disabled={disabled}
            >
              <Play className="h-4 w-4 mr-2" />
              Start Autonomous Execution
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
