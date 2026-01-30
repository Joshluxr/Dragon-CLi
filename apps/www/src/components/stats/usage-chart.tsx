"use client";

import { format } from "date-fns";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { DailyUsageStats } from "@/server-actions/stats";
import { parse } from "date-fns";
import { timeZoneAtom } from "@/atoms/user-cookies";
import { useAtomValue } from "jotai";
import { tz } from "@date-fns/tz";

interface UsageChartProps {
  dailyStats: DailyUsageStats[];
}

const threadsChartConfig = {
  threads: {
    label: "Threads",
    color: "var(--chart-3)", // purple-500
  },
} satisfies ChartConfig;

const prsChartConfig = {
  prs: {
    label: "PRs",
    color: "var(--chart-4)", // orange-500
  },
} satisfies ChartConfig;

export function UsageChart({ dailyStats }: UsageChartProps) {
  const timeZone = useAtomValue(timeZoneAtom);
  if (dailyStats.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No data available for visualization.
      </div>
    );
  }

  // Prepare data for charts
  const chartData = [...dailyStats].reverse().map((day) => {
    return {
      date: format(
        parse(day.date, "yyyy-MM-dd", new Date(), {
          in: tz(timeZone),
        }),
        "MMM d",
      ),
      threads: day.threadsCreated,
      prs: day.prsMerged,
    };
  });

  return (
    <div className="grid gap-8 grid-cols-1 lg:grid-cols-2">
      {/* Threads Created Chart */}
      <div className="space-y-6">
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-medium">Tasks Created</h4>
          <p className="text-sm text-muted-foreground min-h-[2.5rem]">
            Number of tasks created per day.
          </p>
        </div>
        <ChartContainer
          config={threadsChartConfig}
          className="h-[200px] w-full"
        >
          <BarChart data={chartData}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}`}
              domain={[0, (dataMax: number) => Math.max(5, dataMax)]}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => value}
                  formatter={(value) => `${value} threads`}
                />
              }
            />
            <Bar dataKey="threads" fill="var(--color-threads)" radius={4} />
          </BarChart>
        </ChartContainer>
      </div>

      {/* PRs Merged Chart */}
      <div className="space-y-6">
        <div className="flex flex-col gap-1">
          <h4 className="text-sm font-medium">PRs Merged</h4>
          <p className="text-sm text-muted-foreground min-h-[2.5rem]">
            Number of pull requests merged per day.
          </p>
        </div>
        <ChartContainer config={prsChartConfig} className="h-[200px] w-full">
          <BarChart data={chartData}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}`}
              domain={[0, (dataMax: number) => Math.max(5, dataMax)]}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => value}
                  formatter={(value) => `${value} PRs`}
                />
              }
            />
            <Bar dataKey="prs" fill="var(--color-prs)" radius={4} />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  );
}
