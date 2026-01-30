"use client";

import type { UsageStatsSummary } from "@/server-actions/stats";

interface SummaryProps {
  summary: UsageStatsSummary;
}

export function Summary({ summary }: SummaryProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="border rounded-lg p-3 sm:p-4">
        <div className="flex flex-col space-y-1">
          <h4 className="text-xs sm:text-sm font-medium">Tasks Created</h4>
          <div className="text-base sm:text-lg lg:text-xl xl:text-2xl font-bold">
            {summary.totalThreadsCreated.toLocaleString("en-US")}
          </div>
        </div>
      </div>
      <div className="border rounded-lg p-3 sm:p-4">
        <div className="flex flex-col space-y-1">
          <h4 className="text-xs sm:text-sm font-medium">PRs Merged</h4>
          <div className="text-base sm:text-lg lg:text-xl xl:text-2xl font-bold">
            {summary.totalPRsMerged.toLocaleString("en-US")}
          </div>
        </div>
      </div>
    </div>
  );
}
