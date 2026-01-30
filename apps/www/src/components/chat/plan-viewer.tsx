"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  CheckCircle,
  Circle,
  Clock,
  XCircle,
  ChevronDown,
  ChevronRight,
  FileCode,
  Terminal,
} from "lucide-react";
import type {
  PlanPhase,
  PlanStatus,
  PhaseStatus,
  StepStatus,
} from "@terragon/shared";
import { approvePlanAction } from "@/server-actions/plan-approval";
import { calculateTotalSteps, calculateCompletedSteps } from "@terragon/shared";

interface PlanViewerProps {
  planId: string;
  title: string;
  summary: string | null;
  phases: PlanPhase[];
  status: PlanStatus;
  version: number;
  currentStep: number | null;
  estimatedSteps: number | null;
  onApproved?: () => void;
  onRejected?: () => void;
}

function PhaseStatusIcon({ status }: { status: PhaseStatus }) {
  switch (status) {
    case "completed":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "in_progress":
      return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />;
    case "skipped":
      return <XCircle className="h-4 w-4 text-gray-400" />;
    default:
      return <Circle className="h-4 w-4 text-gray-300" />;
  }
}

function StepStatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "completed":
      return <CheckCircle className="h-3 w-3 text-green-500" />;
    case "in_progress":
      return <Clock className="h-3 w-3 text-blue-500 animate-pulse" />;
    case "failed":
      return <XCircle className="h-3 w-3 text-red-500" />;
    case "skipped":
      return <XCircle className="h-3 w-3 text-gray-400" />;
    default:
      return <Circle className="h-3 w-3 text-gray-300" />;
  }
}

function PlanStatusBadge({ status }: { status: PlanStatus }) {
  const variants: Record<
    PlanStatus,
    { label: string; variant: "default" | "secondary" | "destructive" }
  > = {
    draft: { label: "Draft", variant: "secondary" },
    pending_approval: { label: "Awaiting Approval", variant: "default" },
    approved: { label: "Approved", variant: "default" },
    rejected: { label: "Rejected", variant: "destructive" },
    in_progress: { label: "Executing", variant: "default" },
    completed: { label: "Completed", variant: "default" },
    failed: { label: "Failed", variant: "destructive" },
  };

  const { label, variant } = variants[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function PlanViewer({
  planId,
  title,
  summary,
  phases,
  status,
  version,
  currentStep,
  estimatedSteps,
  onApproved,
  onRejected,
}: PlanViewerProps) {
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(
    new Set(phases.map((p) => p.id)),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const togglePhase = (phaseId: string) => {
    const newExpanded = new Set(expandedPhases);
    if (newExpanded.has(phaseId)) {
      newExpanded.delete(phaseId);
    } else {
      newExpanded.add(phaseId);
    }
    setExpandedPhases(newExpanded);
  };

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      const result = await approvePlanAction({
        planId,
        decision: "approve",
      });
      if (result.data?.success) {
        toast.success("Plan approved! Execution starting...");
        onApproved?.();
      } else {
        toast.error(result.errorMessage || "Failed to approve plan");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    setIsSubmitting(true);
    try {
      const result = await approvePlanAction({
        planId,
        decision: "reject",
      });
      if (result.data?.success) {
        toast.info("Plan rejected");
        onRejected?.();
      } else {
        toast.error(result.errorMessage || "Failed to reject plan");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalSteps = estimatedSteps ?? calculateTotalSteps(phases);
  const completedSteps = calculateCompletedSteps(phases);
  const progressPercent =
    totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  return (
    <Card className="border-2 border-blue-500/50">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                Plan v{version}
              </Badge>
              <PlanStatusBadge status={status} />
            </div>
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
        </div>
        {summary && (
          <CardDescription className="text-sm">{summary}</CardDescription>
        )}
      </CardHeader>

      <CardContent className="pb-3">
        <div className="space-y-4">
          {phases.map((phase, phaseIndex) => (
            <div key={phase.id} className="border-l-2 border-gray-200 pl-3">
              <button
                type="button"
                className="flex items-center gap-2 w-full text-left hover:bg-muted/50 rounded p-1 -ml-1"
                onClick={() => togglePhase(phase.id)}
              >
                {expandedPhases.has(phase.id) ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <PhaseStatusIcon status={phase.status} />
                <span className="font-medium text-sm">
                  Phase {phaseIndex + 1}: {phase.name}
                </span>
              </button>

              {expandedPhases.has(phase.id) && (
                <div className="mt-2 ml-6 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {phase.description}
                  </p>

                  <ul className="space-y-1">
                    {phase.steps.map((step) => (
                      <li
                        key={step.id}
                        className={cn(
                          "flex items-start gap-2 p-2 rounded text-sm",
                          step.status === "in_progress" && "bg-blue-50",
                          step.status === "completed" && "bg-green-50",
                          step.status === "failed" && "bg-red-50",
                        )}
                      >
                        <StepStatusIcon status={step.status} />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs">{step.description}</span>
                          {step.files && step.files.length > 0 && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                              <FileCode className="h-3 w-3" />
                              <span className="truncate">
                                {step.files.join(", ")}
                              </span>
                            </div>
                          )}
                          {step.commands && step.commands.length > 0 && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                              <Terminal className="h-3 w-3" />
                              <span className="truncate">
                                {step.commands.join("; ")}
                              </span>
                            </div>
                          )}
                          {step.output && (
                            <div className="mt-1 text-xs text-green-600 bg-green-50 p-1 rounded">
                              {step.output}
                            </div>
                          )}
                          {step.error && (
                            <div className="mt-1 text-xs text-red-600 bg-red-50 p-1 rounded">
                              {step.error}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>

      {status === "pending_approval" && (
        <CardFooter className="flex gap-2 pt-3 border-t">
          <Button
            onClick={handleApprove}
            disabled={isSubmitting}
            className="flex-1"
          >
            Approve & Execute
          </Button>
          <Button
            variant="destructive"
            onClick={handleReject}
            disabled={isSubmitting}
          >
            Reject
          </Button>
        </CardFooter>
      )}

      {status === "in_progress" && (
        <CardFooter className="pt-3 border-t">
          <div className="w-full space-y-2">
            <Progress value={progressPercent} />
            <p className="text-xs text-center text-muted-foreground">
              Step {currentStep ?? completedSteps} of {totalSteps}
            </p>
          </div>
        </CardFooter>
      )}

      {status === "completed" && (
        <CardFooter className="pt-3 border-t">
          <div className="w-full flex items-center justify-center gap-2 text-green-600">
            <CheckCircle className="h-5 w-5" />
            <span className="text-sm font-medium">
              Plan executed successfully
            </span>
          </div>
        </CardFooter>
      )}

      {status === "failed" && (
        <CardFooter className="pt-3 border-t">
          <div className="w-full flex items-center justify-center gap-2 text-red-600">
            <XCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Execution failed</span>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
