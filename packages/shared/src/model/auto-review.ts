/**
 * PR Auto-Review Configuration Types
 *
 * Defines the configuration and types for automatic pull request code reviews.
 */

export type PRReviewTrigger = "opened" | "synchronize" | "ready_for_review";
export type PRReviewFocusArea =
  | "security"
  | "performance"
  | "style"
  | "logic"
  | "tests";
export type PRReviewStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled";
export type PRReviewType = "auto" | "manual";

export interface AutoReviewConfig {
  /** Events that trigger automatic review */
  enabledTriggers: PRReviewTrigger[];
  /** Skip draft PRs */
  skipDraftPRs: boolean;
  /** Skip PRs created by bots */
  skipBots: boolean;
  /** Maximum files changed to trigger auto-review (skip if exceeded) */
  maxFilesChanged: number;
  /** Areas to focus on during review */
  focusAreas: PRReviewFocusArea[];
  /** User-defined custom review rules */
  customRules: string[];
}

export const defaultAutoReviewConfig: AutoReviewConfig = {
  enabledTriggers: ["opened", "ready_for_review"],
  skipDraftPRs: true,
  skipBots: true,
  maxFilesChanged: 50,
  focusAreas: ["security", "logic", "tests"],
  customRules: [],
};

export interface PRReviewSummary {
  text: string;
  overallAssessment: "approve" | "request_changes" | "comment";
  issuesCount: number;
  suggestionsCount: number;
  securityCount: number;
  filesReviewed: number;
}

export function extractReviewSummary(messages: unknown[]): PRReviewSummary {
  const defaultSummary: PRReviewSummary = {
    text: "",
    overallAssessment: "comment",
    issuesCount: 0,
    suggestionsCount: 0,
    securityCount: 0,
    filesReviewed: 0,
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return defaultSummary;
  }

  // Find the last assistant message that contains the review
  const lastAssistantMessage = [...messages].reverse().find((msg) => {
    if (typeof msg !== "object" || msg === null) return false;
    return (msg as Record<string, unknown>).role === "assistant";
  });

  if (!lastAssistantMessage) {
    return defaultSummary;
  }

  const content =
    (lastAssistantMessage as Record<string, unknown>).content || "";
  const text = typeof content === "string" ? content : String(content);

  // Extract statistics from the review
  const issuesMatch = text.match(/Issues Found:\s*(\d+)/i);
  const suggestionsMatch = text.match(/Suggestions:\s*(\d+)/i);
  const securityMatch = text.match(/(?:Security Issues?|Security):\s*(\d+)/i);
  const filesMatch = text.match(/Files Reviewed:\s*(\d+)/i);

  // Determine overall assessment
  let overallAssessment: "approve" | "request_changes" | "comment" = "comment";
  if (text.includes("✅ Approve") || text.toLowerCase().includes("--approve")) {
    overallAssessment = "approve";
  } else if (
    text.includes("⚠️ Request Changes") ||
    text.toLowerCase().includes("--request-changes")
  ) {
    overallAssessment = "request_changes";
  }

  return {
    text: text.slice(0, 500), // Truncate for storage
    overallAssessment,
    issuesCount: issuesMatch?.[1] ? parseInt(issuesMatch[1], 10) : 0,
    suggestionsCount: suggestionsMatch?.[1]
      ? parseInt(suggestionsMatch[1], 10)
      : 0,
    securityCount: securityMatch?.[1] ? parseInt(securityMatch[1], 10) : 0,
    filesReviewed: filesMatch?.[1] ? parseInt(filesMatch[1], 10) : 0,
  };
}
