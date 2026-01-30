/**
 * TDD Guard Configuration Types
 *
 * Defines configuration for test-driven development quality guards.
 */

export interface TDDGuardConfig {
  /** Run TypeScript compilation check */
  typeCheck: boolean;
  /** Run linting */
  lint: boolean;
  /** Auto-fix linting issues */
  lintAutoFix: boolean;
  /** Run tests */
  tests: boolean;
  /** Check test coverage */
  coverage: boolean;
  /** Minimum coverage percentage (0-100) */
  minCoverage: number;
  /** Maximum test duration in seconds */
  maxTestDuration: number;
  /** Block commit if any check fails */
  blockOnFailure: boolean;
  /** Only warn, don't block */
  warnOnly: boolean;
  /** Custom TypeScript check command */
  typeCheckCommand?: string;
  /** Custom lint command */
  lintCommand?: string;
  /** Custom test command */
  testCommand?: string;
  /** Custom coverage command */
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

export interface GuardResult {
  check: string;
  passed: boolean;
  output: string;
  duration: number;
  autoFixed?: boolean;
  fixedFiles?: string[];
}

export interface TDDGuardResults {
  allPassed: boolean;
  results: GuardResult[];
  summary: string;
}

/**
 * Build a summary report from guard results
 */
export function buildGuardSummary(
  results: GuardResult[],
  allPassed: boolean,
): string {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  let summary = `## TDD Guard Results\n\n`;
  summary += allPassed
    ? `All ${passed} checks passed\n\n`
    : `${failed} check(s) failed\n\n`;

  for (const result of results) {
    const icon = result.passed ? "[PASS]" : "[FAIL]";
    summary += `### ${icon} ${result.check} (${result.duration}ms)\n`;
    summary += `\`\`\`\n${result.output}\n\`\`\`\n\n`;

    if (result.autoFixed && result.fixedFiles?.length) {
      summary += `Auto-fixed: ${result.fixedFiles.join(", ")}\n\n`;
    }
  }

  return summary;
}

/**
 * Parse test summary from test output
 */
export function parseTestSummary(output: string): {
  passed: number;
  failed: number;
} {
  // Look for common test result patterns
  const patterns = [
    // Jest/Vitest: "Tests: 10 passed, 2 failed"
    /Tests?:\s*(\d+)\s*passed(?:,\s*(\d+)\s*failed)?/i,
    // Simple: "X passed, Y failed"
    /(\d+)\s*passed(?:,\s*(\d+)\s*failed)?/i,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match) {
      return {
        passed: parseInt(match[1] || "0", 10),
        failed: parseInt(match[2] || "0", 10),
      };
    }
  }

  // Fallback: if "failed" appears, assume failure
  if (/fail/i.test(output)) {
    return { passed: 0, failed: 1 };
  }

  // Assume success if no failure indicators
  return { passed: 1, failed: 0 };
}

/**
 * Parse coverage percentage from coverage output
 */
export function parseCoveragePercentage(output: string): number {
  // Look for common coverage patterns
  const patterns = [
    // "All files ... 85.5%"
    /All files[^%]*(\d+(?:\.\d+)?)\s*%/i,
    // "Coverage: 85.5%"
    /Coverage:\s*(\d+(?:\.\d+)?)\s*%/i,
    // "Statements ... 85.5%"
    /Statements[^%]*(\d+(?:\.\d+)?)\s*%/i,
    // Just a percentage
    /(\d+(?:\.\d+)?)\s*%/,
  ];

  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match && match[1]) {
      return parseFloat(match[1]);
    }
  }

  return 0;
}

/**
 * Extract fixed file paths from lint output
 */
export function extractFixedFiles(output: string): string[] {
  const files: string[] = [];

  // Look for common patterns indicating files were fixed
  const patterns = [
    // ESLint: "fixed: path/to/file.ts"
    /fixed:\s*(.+\.(?:ts|tsx|js|jsx))/gi,
    // "File X was fixed"
    /(?:File\s+)?(.+\.(?:ts|tsx|js|jsx))\s+(?:was\s+)?fixed/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(output)) !== null) {
      if (match[1]) {
        files.push(match[1].trim());
      }
    }
  }

  return [...new Set(files)]; // Remove duplicates
}
