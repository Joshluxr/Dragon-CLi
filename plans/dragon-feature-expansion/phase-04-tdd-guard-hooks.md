# Phase 4: TDD Guard Hooks

**Status**: Pending
**Priority**: 4
**Effort**: Low

---

## Overview

Implement quality guard hooks that:

1. Block changes that violate test-driven development principles
2. Run TypeScript compilation checks before commits
3. Auto-fix linting issues
4. Enforce test coverage thresholds
5. Prevent PR creation if tests fail

---

## How It Works

```
1. Agent makes code changes
2. Before commit, guard hooks run automatically:
   a. TypeScript compilation check
   b. Linting with auto-fix
   c. Test execution
   d. Coverage verification
3. If any check fails:
   a. Block the commit
   b. Report failures to agent
   c. Agent must fix before proceeding
4. Only passing code can be committed/PR'd
```

---

## Files to Modify

### 1. Environment Configuration

```typescript
// packages/shared/src/db/schema.ts
// Add to environmentTable

tddGuardEnabled: boolean("tdd_guard_enabled").default(false),
tddGuardConfig: jsonb("tdd_guard_config").$type<TDDGuardConfig>(),
```

```typescript
// packages/shared/src/model/tdd-guard.ts

export interface TDDGuardConfig {
  // Checks to run
  typeCheck: boolean;
  lint: boolean;
  lintAutoFix: boolean;
  tests: boolean;
  coverage: boolean;

  // Thresholds
  minCoverage: number; // 0-100
  maxTestDuration: number; // seconds

  // Behavior
  blockOnFailure: boolean;
  warnOnly: boolean;

  // Custom commands (override defaults)
  typeCheckCommand?: string;
  lintCommand?: string;
  testCommand?: string;
  coverageCommand?: string;
}

export const defaultTDDGuardConfig: TDDGuardConfig = {
  typeCheck: true,
  lint: true,
  lintAutoFix: true,
  tests: true,
  coverage: false,
  minCoverage: 80,
  maxTestDuration: 300,
  blockOnFailure: true,
  warnOnly: false,
};
```

### 2. Guard Hook Runner (`packages/daemon/src/guards/`)

```typescript
// packages/daemon/src/guards/tdd-guard.ts

export interface GuardResult {
  check: string;
  passed: boolean;
  output: string;
  duration: number;
  autoFixed?: boolean;
  fixedFiles?: string[];
}

export async function runTDDGuards(
  config: TDDGuardConfig,
  cwd: string,
): Promise<{
  allPassed: boolean;
  results: GuardResult[];
  summary: string;
}> {
  const results: GuardResult[] = [];

  // 1. TypeScript Check
  if (config.typeCheck) {
    const typeResult = await runTypeCheck(cwd, config.typeCheckCommand);
    results.push(typeResult);
    if (!typeResult.passed && config.blockOnFailure) {
      return buildSummary(results, false);
    }
  }

  // 2. Linting
  if (config.lint) {
    const lintResult = await runLint(
      cwd,
      config.lintCommand,
      config.lintAutoFix,
    );
    results.push(lintResult);
    if (!lintResult.passed && config.blockOnFailure && !config.lintAutoFix) {
      return buildSummary(results, false);
    }
  }

  // 3. Tests
  if (config.tests) {
    const testResult = await runTests(
      cwd,
      config.testCommand,
      config.maxTestDuration,
    );
    results.push(testResult);
    if (!testResult.passed && config.blockOnFailure) {
      return buildSummary(results, false);
    }
  }

  // 4. Coverage
  if (config.coverage) {
    const coverageResult = await runCoverage(
      cwd,
      config.coverageCommand,
      config.minCoverage,
    );
    results.push(coverageResult);
    if (!coverageResult.passed && config.blockOnFailure) {
      return buildSummary(results, false);
    }
  }

  return buildSummary(results, true);
}

async function runTypeCheck(
  cwd: string,
  command?: string,
): Promise<GuardResult> {
  const start = Date.now();
  const cmd = command || "pnpm tsc-check";

  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd, timeout: 60000 });
    return {
      check: "TypeScript",
      passed: true,
      output: stdout || "No errors",
      duration: Date.now() - start,
    };
  } catch (error: any) {
    return {
      check: "TypeScript",
      passed: false,
      output: error.stderr || error.stdout || error.message,
      duration: Date.now() - start,
    };
  }
}

async function runLint(
  cwd: string,
  command?: string,
  autoFix?: boolean,
): Promise<GuardResult> {
  const start = Date.now();
  const fixFlag = autoFix ? " --fix" : "";
  const cmd = command || `pnpm eslint .${fixFlag}`;

  try {
    const { stdout } = await execAsync(cmd, { cwd, timeout: 120000 });

    // Check if files were auto-fixed
    const fixedFiles = autoFix ? extractFixedFiles(stdout) : [];

    return {
      check: "Lint",
      passed: true,
      output: stdout || "No issues",
      duration: Date.now() - start,
      autoFixed: fixedFiles.length > 0,
      fixedFiles,
    };
  } catch (error: any) {
    return {
      check: "Lint",
      passed: false,
      output: error.stderr || error.stdout || error.message,
      duration: Date.now() - start,
    };
  }
}

async function runTests(
  cwd: string,
  command?: string,
  maxDuration?: number,
): Promise<GuardResult> {
  const start = Date.now();
  const cmd = command || "pnpm test";
  const timeout = (maxDuration || 300) * 1000;

  try {
    const { stdout } = await execAsync(cmd, { cwd, timeout });

    // Parse test results
    const testSummary = parseTestSummary(stdout);

    return {
      check: "Tests",
      passed: testSummary.failed === 0,
      output: `${testSummary.passed} passed, ${testSummary.failed} failed`,
      duration: Date.now() - start,
    };
  } catch (error: any) {
    return {
      check: "Tests",
      passed: false,
      output: error.stderr || error.stdout || error.message,
      duration: Date.now() - start,
    };
  }
}

async function runCoverage(
  cwd: string,
  command?: string,
  minCoverage?: number,
): Promise<GuardResult> {
  const start = Date.now();
  const cmd = command || "pnpm test --coverage";
  const threshold = minCoverage || 80;

  try {
    const { stdout } = await execAsync(cmd, { cwd, timeout: 600000 });

    // Parse coverage percentage
    const coverage = parseCoveragePercentage(stdout);

    return {
      check: "Coverage",
      passed: coverage >= threshold,
      output: `${coverage}% coverage (minimum: ${threshold}%)`,
      duration: Date.now() - start,
    };
  } catch (error: any) {
    return {
      check: "Coverage",
      passed: false,
      output: error.stderr || error.stdout || error.message,
      duration: Date.now() - start,
    };
  }
}

function buildSummary(
  results: GuardResult[],
  allPassed: boolean,
): {
  allPassed: boolean;
  results: GuardResult[];
  summary: string;
} {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  let summary = `## TDD Guard Results\n\n`;
  summary += allPassed
    ? `✅ All ${passed} checks passed\n\n`
    : `❌ ${failed} check(s) failed\n\n`;

  for (const result of results) {
    const icon = result.passed ? "✅" : "❌";
    summary += `### ${icon} ${result.check} (${result.duration}ms)\n`;
    summary += `\`\`\`\n${result.output}\n\`\`\`\n\n`;

    if (result.autoFixed && result.fixedFiles?.length) {
      summary += `🔧 Auto-fixed: ${result.fixedFiles.join(", ")}\n\n`;
    }
  }

  return { allPassed, results, summary };
}
```

### 3. Integration with Daemon Commit Flow

```typescript
// packages/daemon/src/daemon.ts

// Modify the commit handling to include guard checks
async function handlePreCommitGuards(
  threadId: string,
  cwd: string,
): Promise<boolean> {
  const config = await getThreadTDDConfig(threadId);
  if (!config || !config.tddGuardEnabled) {
    return true; // No guards configured
  }

  const guardConfig = config.tddGuardConfig || defaultTDDGuardConfig;
  const { allPassed, summary } = await runTDDGuards(guardConfig, cwd);

  // Send guard results to UI
  await sendDaemonEvent(threadId, {
    type: "tdd_guard_result",
    passed: allPassed,
    summary,
  });

  if (!allPassed && guardConfig.blockOnFailure) {
    // Inject feedback to agent
    await sendToAgent(
      threadId,
      `
⚠️ TDD Guard Check Failed

${summary}

Please fix the failing checks before committing.
`,
    );
    return false;
  }

  return true;
}
```

### 4. Guard Results UI Component

```typescript
// apps/www/src/components/chat/tdd-guard-result.tsx

export function TDDGuardResult({ result }: { result: TDDGuardResultData }) {
  return (
    <div className={cn(
      "border rounded-lg p-4",
      result.passed ? "border-green-500 bg-green-50" : "border-red-500 bg-red-50"
    )}>
      <div className="flex items-center gap-2 mb-2">
        {result.passed ? (
          <CheckCircle className="h-5 w-5 text-green-600" />
        ) : (
          <XCircle className="h-5 w-5 text-red-600" />
        )}
        <span className="font-semibold">
          TDD Guard: {result.passed ? "All Checks Passed" : "Checks Failed"}
        </span>
      </div>

      <Accordion type="single" collapsible>
        {result.results.map((check, i) => (
          <AccordionItem key={i} value={check.check}>
            <AccordionTrigger className="text-sm">
              <span className="flex items-center gap-2">
                {check.passed ? "✅" : "❌"} {check.check}
                <span className="text-muted-foreground">
                  ({check.duration}ms)
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                {check.output}
              </pre>
              {check.autoFixed && (
                <p className="text-sm text-green-600 mt-2">
                  🔧 Auto-fixed: {check.fixedFiles?.join(", ")}
                </p>
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
```

### 5. Settings UI for TDD Guard

```typescript
// apps/www/src/components/settings/tdd-guard-settings.tsx

export function TDDGuardSettings({ environment }: Props) {
  const [config, setConfig] = useState<TDDGuardConfig>(
    environment.tddGuardConfig || defaultTDDGuardConfig
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          TDD Guard
        </CardTitle>
        <CardDescription>
          Enforce code quality checks before commits
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <Switch
          checked={environment.tddGuardEnabled}
          onCheckedChange={handleToggle}
          label="Enable TDD Guard"
        />

        {environment.tddGuardEnabled && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Switch
                checked={config.typeCheck}
                onCheckedChange={(v) => updateConfig({ typeCheck: v })}
                label="TypeScript Check"
              />
              <Switch
                checked={config.lint}
                onCheckedChange={(v) => updateConfig({ lint: v })}
                label="Linting"
              />
              <Switch
                checked={config.lintAutoFix}
                onCheckedChange={(v) => updateConfig({ lintAutoFix: v })}
                label="Auto-fix Lint Issues"
                disabled={!config.lint}
              />
              <Switch
                checked={config.tests}
                onCheckedChange={(v) => updateConfig({ tests: v })}
                label="Run Tests"
              />
              <Switch
                checked={config.coverage}
                onCheckedChange={(v) => updateConfig({ coverage: v })}
                label="Coverage Check"
              />
            </div>

            {config.coverage && (
              <Slider
                label={`Minimum Coverage: ${config.minCoverage}%`}
                value={[config.minCoverage]}
                onValueChange={([v]) => updateConfig({ minCoverage: v })}
                min={0}
                max={100}
                step={5}
              />
            )}

            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-2">Behavior</h4>
              <RadioGroup
                value={config.blockOnFailure ? "block" : "warn"}
                onValueChange={(v) => updateConfig({
                  blockOnFailure: v === "block",
                  warnOnly: v === "warn"
                })}
              >
                <RadioGroupItem value="block" label="Block commits on failure" />
                <RadioGroupItem value="warn" label="Warn only (allow commits)" />
              </RadioGroup>
            </div>

            <Accordion type="single" collapsible>
              <AccordionItem value="custom">
                <AccordionTrigger>Custom Commands</AccordionTrigger>
                <AccordionContent className="space-y-2">
                  <Input
                    label="Type Check Command"
                    placeholder="pnpm tsc-check"
                    value={config.typeCheckCommand || ""}
                    onChange={(e) => updateConfig({ typeCheckCommand: e.target.value })}
                  />
                  <Input
                    label="Lint Command"
                    placeholder="pnpm eslint . --fix"
                    value={config.lintCommand || ""}
                    onChange={(e) => updateConfig({ lintCommand: e.target.value })}
                  />
                  <Input
                    label="Test Command"
                    placeholder="pnpm test"
                    value={config.testCommand || ""}
                    onChange={(e) => updateConfig({ testCommand: e.target.value })}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## Testing Strategy

```typescript
describe("TDD Guard Hooks", () => {
  it("passes when all checks succeed", async () => {
    const result = await runTDDGuards(defaultTDDGuardConfig, mockCwd);
    expect(result.allPassed).toBe(true);
  });

  it("blocks on TypeScript errors", async () => {
    mockTypeCheckFailure();
    const result = await runTDDGuards(defaultTDDGuardConfig, mockCwd);
    expect(result.allPassed).toBe(false);
    expect(result.results[0].check).toBe("TypeScript");
  });

  it("auto-fixes lint issues when enabled", async () => {
    const config = { ...defaultTDDGuardConfig, lintAutoFix: true };
    const result = await runTDDGuards(config, mockCwd);
    expect(result.results.find((r) => r.check === "Lint")?.autoFixed).toBe(
      true,
    );
  });

  it("enforces coverage threshold", async () => {
    mockCoverage(70);
    const config = {
      ...defaultTDDGuardConfig,
      coverage: true,
      minCoverage: 80,
    };
    const result = await runTDDGuards(config, mockCwd);
    expect(result.allPassed).toBe(false);
  });
});
```

---

## Security Considerations

- Timeout all guard commands to prevent hanging
- Sanitize command output before display
- Don't expose file paths outside repo
- Rate limit guard runs to prevent abuse
