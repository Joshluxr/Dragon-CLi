import { Endpoints } from "@octokit/types";
import {
  GithubCheckStatus,
  GithubPRMergeableState,
  GithubPRStatus,
} from "../db/types";

// octokit.rest.pulls.get
type GithubPRGetResponse =
  Endpoints["GET /repos/{owner}/{repo}/pulls/{pull_number}"]["response"]["data"];
// octokit.rest.pulls.list
type GithubPRListResponseItem =
  Endpoints["GET /repos/{owner}/{repo}/pulls"]["response"]["data"][number];
// octokit.rest.checks.listForRef
type GithubPRChecksListResponse =
  Endpoints["GET /repos/{owner}/{repo}/commits/{ref}/check-runs"]["response"]["data"];

type GithubPRResponse = GithubPRGetResponse | GithubPRListResponseItem;

export function getGithubPRStatus(
  pr: Pick<GithubPRResponse, "merged_at" | "closed_at" | "draft">,
): GithubPRStatus {
  if (pr.merged_at) {
    return "merged";
  }
  if (pr.closed_at) {
    return "closed";
  }
  if (pr.draft) {
    return "draft";
  }
  return "open";
}

export function getGithubPRMergeableState(
  pr: Pick<GithubPRGetResponse, "mergeable_state">,
): GithubPRMergeableState {
  switch (pr.mergeable_state) {
    case "clean":
      return "clean";
    case "dirty":
      return "dirty";
    case "blocked":
      return "blocked";
    case "unstable":
      return "unstable";
    default:
      return "unknown";
  }
}

export function getGithubPRChecksStatus(
  checks: GithubPRChecksListResponse,
): GithubCheckStatus | null {
  if (checks.total_count === 0) {
    return "none";
  }
  const statuses = checks.check_runs.map((run) => run.status);
  const conclusions = checks.check_runs.map((run) => run.conclusion);
  if (
    statuses.some((status) => status === "queued" || status === "in_progress")
  ) {
    return "pending";
  }
  if (
    conclusions.some(
      (conclusion) =>
        conclusion === "failure" ||
        conclusion === "timed_out" ||
        conclusion === "cancelled",
    )
  ) {
    return "failure";
  }
  if (
    conclusions.every(
      (conclusion) =>
        conclusion === "success" ||
        conclusion === "neutral" ||
        conclusion === "skipped",
    )
  ) {
    return "success";
  }
  return "unknown";
}
