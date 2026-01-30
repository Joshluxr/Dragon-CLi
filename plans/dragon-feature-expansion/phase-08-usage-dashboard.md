# Phase 8: Usage Dashboard

**Status**: Pending
**Priority**: 8
**Effort**: Low

---

## Overview

Comprehensive analytics dashboard showing:

1. Token usage and costs over time
2. Task success/failure rates
3. Agent performance metrics
4. Session analytics
5. Cost forecasting

---

## How It Works

```
1. Track metrics during agent execution
2. Aggregate data in time-series format
3. Display in admin and user dashboards
4. Provide cost alerts and limits
5. Generate usage reports
```

---

## Files to Modify

### 1. Database Schema (`packages/shared/src/db/schema.ts`)

```typescript
// Usage metrics table
export const usageMetricTable = pgTable("usage_metric", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => userTable.id),
  threadId: uuid("thread_id").references(() => threadTable.id),
  chatId: uuid("chat_id").references(() => threadChatTable.id),
  agent: text("agent").$type<AgentType>(),
  model: text("model"),

  // Token metrics
  inputTokens: integer("input_tokens").default(0),
  outputTokens: integer("output_tokens").default(0),
  cacheReadTokens: integer("cache_read_tokens").default(0),
  cacheWriteTokens: integer("cache_write_tokens").default(0),

  // Cost (in cents)
  costCents: integer("cost_cents").default(0),

  // Performance
  durationMs: integer("duration_ms").default(0),
  toolCallCount: integer("tool_call_count").default(0),

  // Outcome
  success: boolean("success"),
  errorType: text("error_type"),

  // Timestamp
  createdAt: timestamp("created_at").defaultNow(),
  date: text("date"), // YYYY-MM-DD for easy grouping
});

// Aggregated daily stats
export const dailyUsageStatsTable = pgTable(
  "daily_usage_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => userTable.id),
    date: text("date").notNull(), // YYYY-MM-DD

    // Aggregates
    totalTasks: integer("total_tasks").default(0),
    successfulTasks: integer("successful_tasks").default(0),
    failedTasks: integer("failed_tasks").default(0),
    totalInputTokens: integer("total_input_tokens").default(0),
    totalOutputTokens: integer("total_output_tokens").default(0),
    totalCostCents: integer("total_cost_cents").default(0),
    totalDurationMs: integer("total_duration_ms").default(0),

    // By agent
    byAgent: jsonb("by_agent").$type<Record<string, AgentStats>>(),

    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    userDateIdx: uniqueIndex("user_date_idx").on(table.userId, table.date),
  }),
);

// User cost limits
export const userCostLimitTable = pgTable("user_cost_limit", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => userTable.id)
    .unique(),
  dailyLimitCents: integer("daily_limit_cents"),
  monthlyLimitCents: integer("monthly_limit_cents"),
  alertThresholdPercent: integer("alert_threshold_percent").default(80),
  lastAlertAt: timestamp("last_alert_at"),
});
```

### 2. Usage Tracking Service

```typescript
// packages/shared/src/services/usage-tracker.ts

export async function trackUsage(data: {
  userId: string;
  threadId: string;
  chatId: string;
  agent: AgentType;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  durationMs: number;
  toolCallCount: number;
  success: boolean;
  errorType?: string;
}): Promise<void> {
  const costCents = calculateCost(data.agent, data.model, data.usage);
  const date = new Date().toISOString().split("T")[0];

  // Insert metric
  await db.insert(usageMetricTable).values({
    ...data,
    costCents,
    date,
    inputTokens: data.usage.inputTokens,
    outputTokens: data.usage.outputTokens,
    cacheReadTokens: data.usage.cacheReadTokens || 0,
    cacheWriteTokens: data.usage.cacheWriteTokens || 0,
  });

  // Update daily stats
  await updateDailyStats(data.userId, date, {
    tasks: 1,
    successful: data.success ? 1 : 0,
    failed: data.success ? 0 : 1,
    inputTokens: data.usage.inputTokens,
    outputTokens: data.usage.outputTokens,
    costCents,
    durationMs: data.durationMs,
    agent: data.agent,
  });

  // Check cost limits
  await checkCostLimits(data.userId);
}

function calculateCost(
  agent: AgentType,
  model: string,
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  },
): number {
  // Pricing per million tokens (in cents)
  const pricing: Record<
    string,
    { input: number; output: number; cacheRead?: number; cacheWrite?: number }
  > = {
    "claude-opus-4-5-20251101": {
      input: 1500,
      output: 7500,
      cacheRead: 150,
      cacheWrite: 1875,
    },
    "claude-sonnet-4-20250514": {
      input: 300,
      output: 1500,
      cacheRead: 30,
      cacheWrite: 375,
    },
    "claude-haiku-3-5-20241022": {
      input: 100,
      output: 500,
      cacheRead: 10,
      cacheWrite: 125,
    },
    "gpt-4o": { input: 500, output: 1500 },
    "gpt-4o-mini": { input: 15, output: 60 },
    "gemini-2.5-pro": { input: 125, output: 500 },
  };

  const modelPricing = pricing[model] || pricing["claude-sonnet-4-20250514"];

  const inputCost = (usage.inputTokens / 1_000_000) * modelPricing.input;
  const outputCost = (usage.outputTokens / 1_000_000) * modelPricing.output;
  const cacheReadCost =
    ((usage.cacheReadTokens || 0) / 1_000_000) * (modelPricing.cacheRead || 0);
  const cacheWriteCost =
    ((usage.cacheWriteTokens || 0) / 1_000_000) *
    (modelPricing.cacheWrite || 0);

  return Math.round(inputCost + outputCost + cacheReadCost + cacheWriteCost);
}

async function checkCostLimits(userId: string): Promise<void> {
  const limits = await db.query.userCostLimitTable.findFirst({
    where: eq(userCostLimitTable.userId, userId),
  });

  if (!limits) return;

  const today = new Date().toISOString().split("T")[0];
  const monthStart = today.slice(0, 7) + "-01";

  // Get daily and monthly totals
  const dailyStats = await db.query.dailyUsageStatsTable.findFirst({
    where: and(
      eq(dailyUsageStatsTable.userId, userId),
      eq(dailyUsageStatsTable.date, today),
    ),
  });

  const monthlyStats = await db
    .select({ total: sum(dailyUsageStatsTable.totalCostCents) })
    .from(dailyUsageStatsTable)
    .where(
      and(
        eq(dailyUsageStatsTable.userId, userId),
        gte(dailyUsageStatsTable.date, monthStart),
      ),
    );

  const dailySpent = dailyStats?.totalCostCents || 0;
  const monthlySpent = Number(monthlyStats[0]?.total || 0);

  // Check thresholds and send alerts
  if (
    limits.dailyLimitCents &&
    dailySpent >= limits.dailyLimitCents * (limits.alertThresholdPercent / 100)
  ) {
    await sendCostAlert(userId, "daily", dailySpent, limits.dailyLimitCents);
  }

  if (
    limits.monthlyLimitCents &&
    monthlySpent >=
      limits.monthlyLimitCents * (limits.alertThresholdPercent / 100)
  ) {
    await sendCostAlert(
      userId,
      "monthly",
      monthlySpent,
      limits.monthlyLimitCents,
    );
  }
}
```

### 3. Dashboard API Routes

```typescript
// apps/www/src/app/api/usage/route.ts

export async function GET(request: Request) {
  const session = await getSession(request);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") || "7d";
  const groupBy = searchParams.get("groupBy") || "day";

  const data = await getUsageData(session.user.id, period, groupBy);

  return Response.json(data);
}

async function getUsageData(userId: string, period: string, groupBy: string) {
  const days = period === "30d" ? 30 : period === "90d" ? 90 : 7;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split("T")[0];

  const stats = await db.query.dailyUsageStatsTable.findMany({
    where: and(
      eq(dailyUsageStatsTable.userId, userId),
      gte(dailyUsageStatsTable.date, startDateStr),
    ),
    orderBy: [asc(dailyUsageStatsTable.date)],
  });

  // Aggregate by groupBy
  if (groupBy === "week") {
    return aggregateByWeek(stats);
  }

  return stats.map((s) => ({
    date: s.date,
    tasks: s.totalTasks,
    successRate: s.totalTasks ? (s.successfulTasks / s.totalTasks) * 100 : 0,
    tokens: s.totalInputTokens + s.totalOutputTokens,
    cost: s.totalCostCents / 100, // Convert to dollars
    avgDuration: s.totalTasks ? s.totalDurationMs / s.totalTasks / 1000 : 0, // Seconds
    byAgent: s.byAgent,
  }));
}
```

### 4. Dashboard UI Components

```typescript
// apps/www/src/components/dashboard/usage-dashboard.tsx

export function UsageDashboard() {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("7d");
  const { data, isLoading } = useUsageData(period);

  if (isLoading) return <DashboardSkeleton />;

  const totals = calculateTotals(data);

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Usage Analytics</h2>
        <ToggleGroup value={period} onValueChange={setPeriod}>
          <ToggleGroupItem value="7d">7 Days</ToggleGroupItem>
          <ToggleGroupItem value="30d">30 Days</ToggleGroupItem>
          <ToggleGroupItem value="90d">90 Days</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatsCard
          title="Total Tasks"
          value={totals.tasks}
          icon={<Activity />}
          trend={totals.tasksTrend}
        />
        <StatsCard
          title="Success Rate"
          value={`${totals.successRate.toFixed(1)}%`}
          icon={<CheckCircle />}
          trend={totals.successRateTrend}
          trendType={totals.successRateTrend >= 0 ? "positive" : "negative"}
        />
        <StatsCard
          title="Tokens Used"
          value={formatNumber(totals.tokens)}
          icon={<Coins />}
          subtitle={`${formatNumber(totals.inputTokens)} in / ${formatNumber(totals.outputTokens)} out`}
        />
        <StatsCard
          title="Total Cost"
          value={`$${totals.cost.toFixed(2)}`}
          icon={<DollarSign />}
          trend={totals.costTrend}
          trendType={totals.costTrend <= 0 ? "positive" : "negative"}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost Over Time */}
        <Card>
          <CardHeader>
            <CardTitle>Cost Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <LineChart
              data={data}
              xKey="date"
              yKey="cost"
              yLabel="Cost ($)"
              color="hsl(var(--chart-1))"
            />
          </CardContent>
        </Card>

        {/* Tasks and Success Rate */}
        <Card>
          <CardHeader>
            <CardTitle>Tasks & Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <ComposedChart data={data}>
              <Bar dataKey="tasks" fill="hsl(var(--chart-2))" name="Tasks" />
              <Line
                dataKey="successRate"
                stroke="hsl(var(--chart-3))"
                name="Success %"
                yAxisId="right"
              />
            </ComposedChart>
          </CardContent>
        </Card>

        {/* Token Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Token Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <PieChart
              data={[
                { name: "Input", value: totals.inputTokens },
                { name: "Output", value: totals.outputTokens },
                { name: "Cache Read", value: totals.cacheReadTokens },
              ]}
            />
          </CardContent>
        </Card>

        {/* Usage by Agent */}
        <Card>
          <CardHeader>
            <CardTitle>Usage by Agent</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={aggregateByAgent(data)}
              xKey="agent"
              yKey="cost"
              yLabel="Cost ($)"
            />
          </CardContent>
        </Card>
      </div>

      {/* Cost Limits */}
      <CostLimitsCard />

      {/* Recent Activity Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <RecentActivityTable />
        </CardContent>
      </Card>
    </div>
  );
}
```

### 5. Cost Limits Settings

```typescript
// apps/www/src/components/settings/cost-limits.tsx

export function CostLimitsSettings() {
  const { data: limits, mutate } = useCostLimits();
  const [dailyLimit, setDailyLimit] = useState(limits?.dailyLimitCents / 100 || 0);
  const [monthlyLimit, setMonthlyLimit] = useState(limits?.monthlyLimitCents / 100 || 0);
  const [alertThreshold, setAlertThreshold] = useState(limits?.alertThresholdPercent || 80);

  const handleSave = async () => {
    await saveCostLimits({
      dailyLimitCents: Math.round(dailyLimit * 100),
      monthlyLimitCents: Math.round(monthlyLimit * 100),
      alertThresholdPercent: alertThreshold,
    });
    mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost Limits</CardTitle>
        <CardDescription>
          Set spending limits to control costs. You'll receive alerts when approaching limits.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Daily Limit ($)</Label>
            <Input
              type="number"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(Number(e.target.value))}
              placeholder="No limit"
            />
          </div>
          <div>
            <Label>Monthly Limit ($)</Label>
            <Input
              type="number"
              value={monthlyLimit}
              onChange={(e) => setMonthlyLimit(Number(e.target.value))}
              placeholder="No limit"
            />
          </div>
        </div>

        <div>
          <Label>Alert Threshold: {alertThreshold}%</Label>
          <Slider
            value={[alertThreshold]}
            onValueChange={([v]) => setAlertThreshold(v)}
            min={50}
            max={95}
            step={5}
          />
          <p className="text-sm text-muted-foreground mt-1">
            Receive alerts when spending reaches this percentage of your limit
          </p>
        </div>

        <Button onClick={handleSave}>Save Limits</Button>
      </CardContent>
    </Card>
  );
}
```

### 6. Admin Dashboard Extension

```typescript
// apps/www/src/app/admin/usage/page.tsx

export default function AdminUsagePage() {
  const { data } = useAdminUsageStats();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Platform Usage</h1>

      {/* Platform-wide Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <StatsCard title="Total Users" value={data.totalUsers} />
        <StatsCard title="Active Today" value={data.activeToday} />
        <StatsCard title="Total Tasks" value={data.totalTasks} />
        <StatsCard title="Total Tokens" value={formatNumber(data.totalTokens)} />
        <StatsCard title="Total Cost" value={`$${data.totalCost.toFixed(2)}`} />
      </div>

      {/* Top Users by Usage */}
      <Card>
        <CardHeader>
          <CardTitle>Top Users by Cost</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Tasks</TableHead>
                <TableHead>Tokens</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Success Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.topUsers.map(user => (
                <TableRow key={user.id}>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.tasks}</TableCell>
                  <TableCell>{formatNumber(user.tokens)}</TableCell>
                  <TableCell>${user.cost.toFixed(2)}</TableCell>
                  <TableCell>{user.successRate.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Usage Trends */}
      <Card>
        <CardHeader>
          <CardTitle>Platform Usage Trends</CardTitle>
        </CardHeader>
        <CardContent>
          <LineChart
            data={data.dailyStats}
            lines={[
              { key: "tasks", color: "blue", label: "Tasks" },
              { key: "cost", color: "green", label: "Cost ($)" },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Testing Strategy

```typescript
describe("Usage Dashboard", () => {
  it("tracks usage metrics correctly", async () => {
    await trackUsage({
      userId: testUser.id,
      threadId: testThread.id,
      chatId: testChat.id,
      agent: "claudeCode",
      model: "claude-sonnet-4-20250514",
      usage: { inputTokens: 1000, outputTokens: 500 },
      durationMs: 5000,
      toolCallCount: 10,
      success: true,
    });

    const metric = await db.query.usageMetricTable.findFirst({
      where: eq(usageMetricTable.threadId, testThread.id),
    });

    expect(metric).toBeDefined();
    expect(metric.inputTokens).toBe(1000);
    expect(metric.costCents).toBeGreaterThan(0);
  });

  it("aggregates daily stats", async () => {
    // Create multiple metrics
    await trackUsage({ ...mockUsage, success: true });
    await trackUsage({ ...mockUsage, success: false });

    const stats = await getDailyStats(testUser.id, today);
    expect(stats.totalTasks).toBe(2);
    expect(stats.successfulTasks).toBe(1);
  });

  it("triggers cost alerts", async () => {
    await setCostLimit(testUser.id, { dailyLimitCents: 100 });
    const sendAlertSpy = vi.spyOn(notifications, "sendCostAlert");

    // Spend 85% of limit
    await trackUsage({ ...mockUsage, costCents: 85 });

    expect(sendAlertSpy).toHaveBeenCalledWith(
      testUser.id,
      "daily",
      expect.any(Number),
      100,
    );
  });
});
```

---

## Security Considerations

- Rate limit API endpoints
- Only show user's own data (except admins)
- Encrypt sensitive cost data
- Audit log for limit changes
- GDPR compliance for usage data
