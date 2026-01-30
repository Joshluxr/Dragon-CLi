"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Summary } from "./summary";
import { DateRangeSelector } from "./date-range-selector";
import { UsageChart } from "./usage-chart";
import { AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { statsQueryOptions } from "@/queries/stats-queries";
import { timeZoneAtom } from "@/atoms/user-cookies";
import { useAtom } from "jotai";

export function Stats() {
  const [timeZone] = useAtom(timeZoneAtom);
  const [numDays, setNumDays] = useState(7);

  const {
    data: statsData,
    isLoading,
    error,
  } = useQuery(statsQueryOptions({ numDays, timezone: timeZone }));
  if (error) {
    return (
      <div className="mx-auto p-8 w-full">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load usage statistics. Please try again later.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading || !statsData) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto space-y-8 w-full">
      <div className="space-y-6 w-full">
        <DateRangeSelector numDays={numDays} onNumDaysChange={setNumDays} />
        <Summary summary={statsData.summary} />
        <UsageChart dailyStats={statsData.dailyStats} />
      </div>
    </div>
  );
}
