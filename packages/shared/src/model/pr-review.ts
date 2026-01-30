/**
 * PR Review Model Functions
 *
 * Database operations for automatic and manual PR code reviews.
 */

import { and, eq, desc } from "drizzle-orm";
import { prReview, environment, githubPR } from "../db/schema";
import { DB } from "../db";
import type { PRReviewStatus, PRReviewSummary } from "./auto-review";

export interface CreatePRReviewArgs {
  db: DB;
  userId: string;
  repoFullName: string;
  prNumber: number;
  threadId?: string;
  reviewType: "auto" | "manual";
}

export async function createPRReview({
  db,
  userId,
  repoFullName,
  prNumber,
  threadId,
  reviewType,
}: CreatePRReviewArgs) {
  // Try to find the associated github PR record
  const existingGithubPR = await db.query.githubPR.findFirst({
    where: and(
      eq(githubPR.repoFullName, repoFullName),
      eq(githubPR.number, prNumber),
    ),
  });

  const [review] = await db
    .insert(prReview)
    .values({
      userId,
      repoFullName,
      prNumber,
      threadId,
      reviewType,
      status: "pending",
      githubPRId: existingGithubPR?.id,
    })
    .returning();

  return review;
}

export interface UpdatePRReviewStatusArgs {
  db: DB;
  reviewId: string;
  status: PRReviewStatus;
  summary?: PRReviewSummary;
}

export async function updatePRReviewStatus({
  db,
  reviewId,
  status,
  summary,
}: UpdatePRReviewStatusArgs) {
  const updateData: Record<string, unknown> = { status };

  if (status === "completed") {
    updateData.completedAt = new Date();
  }

  if (summary) {
    updateData.summary = summary.text;
    updateData.overallAssessment = summary.overallAssessment;
    updateData.issuesFound = summary.issuesCount;
    updateData.suggestionsCount = summary.suggestionsCount;
    updateData.securityIssues = summary.securityCount;
    updateData.filesReviewed = summary.filesReviewed;
  }

  const [updated] = await db
    .update(prReview)
    .set(updateData)
    .where(eq(prReview.id, reviewId))
    .returning();

  return updated;
}

export interface GetPRReviewsArgs {
  db: DB;
  userId?: string;
  repoFullName?: string;
  prNumber?: number;
  limit?: number;
}

export async function getPRReviews({
  db,
  userId,
  repoFullName,
  prNumber,
  limit = 10,
}: GetPRReviewsArgs) {
  const conditions = [];

  if (userId) {
    conditions.push(eq(prReview.userId, userId));
  }
  if (repoFullName) {
    conditions.push(eq(prReview.repoFullName, repoFullName));
  }
  if (prNumber) {
    conditions.push(eq(prReview.prNumber, prNumber));
  }

  const reviews = await db.query.prReview.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: [desc(prReview.createdAt)],
    limit,
  });

  return reviews;
}

export interface GetPRReviewByThreadArgs {
  db: DB;
  threadId: string;
}

export async function getPRReviewByThread({
  db,
  threadId,
}: GetPRReviewByThreadArgs) {
  return db.query.prReview.findFirst({
    where: eq(prReview.threadId, threadId),
  });
}

export interface GetEnvironmentWithAutoReviewArgs {
  db: DB;
  repoFullName: string;
}

export async function getEnvironmentsWithAutoReview({
  db,
  repoFullName,
}: GetEnvironmentWithAutoReviewArgs) {
  return db.query.environment.findMany({
    where: and(
      eq(environment.repoFullName, repoFullName),
      eq(environment.autoReviewEnabled, true),
    ),
  });
}

export interface UpdateEnvironmentAutoReviewArgs {
  db: DB;
  userId: string;
  repoFullName: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}

export async function updateEnvironmentAutoReview({
  db,
  userId,
  repoFullName,
  enabled,
  config,
}: UpdateEnvironmentAutoReviewArgs) {
  const updateData: Record<string, unknown> = {
    autoReviewEnabled: enabled,
  };

  if (config !== undefined) {
    updateData.autoReviewConfig = config;
  }

  const [updated] = await db
    .update(environment)
    .set(updateData)
    .where(
      and(
        eq(environment.userId, userId),
        eq(environment.repoFullName, repoFullName),
      ),
    )
    .returning();

  return updated;
}
