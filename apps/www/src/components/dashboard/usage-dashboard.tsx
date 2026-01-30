"use client";

import { useState } from "react";
import {
  Activity,
  CheckCircle,
  Coins,
  DollarSign,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DailyUsageData, UsageSummary } from "@dragon/shared";
import { formatNumber, aggregateByAgent } from "@dragon/shared";

interface UsageDashboardProps {
  data: DailyUsageData[];
  summary: UsageSummary;
}

type Period = "7d" | "30d" | "90d";

function StatsCard({
  title,
  value,
  icon,
  trend,
  trendType = "neutral",
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: number;
  trendType?: "positive" | "negative" | "neutral";
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="p-2 bg-muted rounded-lg">{icon}</div>
          {trend !== undefined && (
            <div
              className={cn(
                "flex items-center gap-1 text-xs",
                trendType === "positive" && "text-green-500",
                trendType === "negative" && "text-red-500",
                trendType === "neutral" && "text-muted-foreground",
              )}
            >
              {trend >= 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {Math.abs(trend)}%
            </div>
          )}
        </div>
        <div className="mt-3">
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-muted-foreground">{title}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SimpleBarChart({
  data,
  dataKey,
  label,
  color = "bg-primary",
}: {
  data: DailyUsageData[];
  dataKey: keyof DailyUsageData;
  label: string;
  color?: string;
}) {
  const values = data.map((d) => Number(d[dataKey]) || 0);
  const maxValue = Math.max(...values, 1);

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="flex items-end gap-1 h-32">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center">
            <div
              className={cn("w-full rounded-t", color)}
              style={{
                height: `${((values[i] ?? 0) / maxValue) * 100}%`,
                minHeight: (values[i] ?? 0) > 0 ? "4px" : "0",
              }}
            />
            <span className="text-xs text-muted-foreground mt-1 truncate w-full text-center">
              {d.date.slice(-2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentBreakdown({ data }: { data: DailyUsageData[] }) {
  const agentData = aggregateByAgent(data);

  if (agentData.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No agent data available</p>
    );
  }

  const maxCost = Math.max(...agentData.map((a) => a.cost), 1);

  return (
    <div className="space-y-3">
      {agentData.map((agent) => (
        <div key={agent.agent} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="capitalize">{agent.agent}</span>
            <span className="text-muted-foreground">
              ${agent.cost.toFixed(2)} ({agent.tasks} tasks)
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${(agent.cost / maxCost) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function UsageDashboard({ data, summary }: UsageDashboardProps) {
  const [period, setPeriod] = useState<Period>("7d");

  const filteredData = (() => {
    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    return data.slice(-days);
  })();

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Usage Analytics</h2>
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {(["7d", "30d", "90d"] as Period[]).map((p) => (
            <Button
              key={p}
              variant={period === p ? "default" : "ghost"}
              size="sm"
              onClick={() => setPeriod(p)}
              className="h-7 px-3"
            >
              {p === "7d" ? "7 Days" : p === "30d" ? "30 Days" : "90 Days"}
            </Button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Tasks"
          value={summary.tasks}
          icon={<Activity className="h-4 w-4" />}
          trend={summary.tasksTrend}
          trendType={summary.tasksTrend >= 0 ? "neutral" : "negative"}
        />
        <StatsCard
          title="Success Rate"
          value={`${summary.successRate.toFixed(1)}%`}
          icon={<CheckCircle className="h-4 w-4" />}
          trend={summary.successRateTrend}
          trendType={summary.successRateTrend >= 0 ? "positive" : "negative"}
        />
        <StatsCard
          title="Tokens Used"
          value={formatNumber(summary.tokens)}
          icon={<Coins className="h-4 w-4" />}
          subtitle={`${formatNumber(summary.inputTokens)} in / ${formatNumber(summary.outputTokens)} out`}
        />
        <StatsCard
          title="Total Cost"
          value={`$${summary.cost.toFixed(2)}`}
          icon={<DollarSign className="h-4 w-4" />}
          trend={summary.costTrend}
          trendType={summary.costTrend <= 0 ? "positive" : "negative"}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Cost Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBarChart
              data={filteredData}
              dataKey="cost"
              label="Daily Cost ($)"
              color="bg-blue-500"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tasks Per Day</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBarChart
              data={filteredData}
              dataKey="tasks"
              label="Tasks"
              color="bg-green-500"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBarChart
              data={filteredData}
              dataKey="successRate"
              label="Success %"
              color="bg-emerald-500"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Usage by Agent</CardTitle>
          </CardHeader>
          <CardContent>
            <AgentBreakdown data={filteredData} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
