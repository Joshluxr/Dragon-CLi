"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import type { TDDGuardResults, GuardResult } from "@dragon/shared";

interface TDDGuardResultProps {
  result: TDDGuardResults;
}

export function TDDGuardResult({ result }: TDDGuardResultProps) {
  const [expandedChecks, setExpandedChecks] = useState<Set<string>>(new Set());

  const toggleCheck = (check: string) => {
    const newExpanded = new Set(expandedChecks);
    if (newExpanded.has(check)) {
      newExpanded.delete(check);
    } else {
      newExpanded.add(check);
    }
    setExpandedChecks(newExpanded);
  };

  return (
    <div
      className={cn(
        "border rounded-lg p-4",
        result.allPassed
          ? "border-green-500 bg-green-50"
          : "border-red-500 bg-red-50",
      )}
    >
      <div className="flex items-center gap-2 mb-4">
        {result.allPassed ? (
          <CheckCircle className="h-5 w-5 text-green-600" />
        ) : (
          <XCircle className="h-5 w-5 text-red-600" />
        )}
        <span className="font-semibold">
          TDD Guard: {result.allPassed ? "All Checks Passed" : "Checks Failed"}
        </span>
      </div>

      <div className="space-y-2">
        {result.results.map((check) => (
          <CheckResultItem
            key={check.check}
            check={check}
            expanded={expandedChecks.has(check.check)}
            onToggle={() => toggleCheck(check.check)}
          />
        ))}
      </div>
    </div>
  );
}

function CheckResultItem({
  check,
  expanded,
  onToggle,
}: {
  check: GuardResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border rounded bg-white">
      <button
        type="button"
        className="flex items-center justify-between w-full p-3 text-left"
        onClick={onToggle}
      >
        <span className="flex items-center gap-2">
          {check.passed ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
          <span className="font-medium text-sm">{check.check}</span>
          <span className="text-xs text-muted-foreground">
            ({check.duration}ms)
          </span>
        </span>
        {expanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-48 overflow-y-auto">
            {check.output}
          </pre>
          {check.autoFixed &&
            check.fixedFiles &&
            check.fixedFiles.length > 0 && (
              <p className="text-sm text-green-600">
                Auto-fixed: {check.fixedFiles.join(", ")}
              </p>
            )}
        </div>
      )}
    </div>
  );
}
