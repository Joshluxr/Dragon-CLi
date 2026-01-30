"use server";

import { userOnlyAction } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { updateEnvironmentAutoReview } from "@dragon/shared/model/pr-review";
import { getOrCreateEnvironment } from "@dragon/shared/model/environments";
import { getPostHogServer } from "@/lib/posthog-server";
import type {
  AutoReviewConfig,
  TDDGuardConfig,
  BrowserConfig,
} from "@dragon/shared";
import { environment } from "@dragon/shared/db/schema";
import { and, eq } from "drizzle-orm";

export const updateEnvironmentAutoReviewAction = userOnlyAction(
  async function updateEnvironmentAutoReviewAction(
    userId: string,
    {
      repoFullName,
      enabled,
      config,
    }: {
      repoFullName: string;
      enabled: boolean;
      config: AutoReviewConfig;
    },
  ): Promise<void> {
    getPostHogServer().capture({
      distinctId: userId,
      event: "update_auto_review_settings",
      properties: {
        repoFullName,
        enabled,
        focusAreas: config.focusAreas,
        triggersCount: config.enabledTriggers.length,
      },
    });

    // Ensure environment exists
    await getOrCreateEnvironment({
      db,
      userId,
      repoFullName,
    });

    // Update auto-review settings
    await updateEnvironmentAutoReview({
      db,
      userId,
      repoFullName,
      enabled,
      config: config as unknown as Record<string, unknown>,
    });
  },
  { defaultErrorMessage: "Failed to update auto-review settings" },
);

export const updateEnvironmentTDDGuardAction = userOnlyAction(
  async function updateEnvironmentTDDGuardAction(
    userId: string,
    {
      repoFullName,
      enabled,
      config,
    }: {
      repoFullName: string;
      enabled: boolean;
      config: TDDGuardConfig;
    },
  ): Promise<void> {
    getPostHogServer().capture({
      distinctId: userId,
      event: "update_tdd_guard_settings",
      properties: {
        repoFullName,
        enabled,
        typeCheck: config.typeCheck,
        lint: config.lint,
        tests: config.tests,
        coverage: config.coverage,
        blockOnFailure: config.blockOnFailure,
      },
    });

    // Ensure environment exists
    await getOrCreateEnvironment({
      db,
      userId,
      repoFullName,
    });

    // Update TDD guard settings
    await db
      .update(environment)
      .set({
        tddGuardEnabled: enabled,
        tddGuardConfig: config,
      })
      .where(
        and(
          eq(environment.userId, userId),
          eq(environment.repoFullName, repoFullName),
        ),
      );
  },
  { defaultErrorMessage: "Failed to update TDD guard settings" },
);

export const updateEnvironmentBrowserAction = userOnlyAction(
  async function updateEnvironmentBrowserAction(
    userId: string,
    {
      repoFullName,
      enabled,
      config,
    }: {
      repoFullName: string;
      enabled: boolean;
      config: BrowserConfig;
    },
  ): Promise<void> {
    getPostHogServer().capture({
      distinctId: userId,
      event: "update_browser_settings",
      properties: {
        repoFullName,
        enabled,
        allowedDomainsCount: config.allowedDomains.length,
        viewportWidth: config.defaultViewport.width,
        viewportHeight: config.defaultViewport.height,
      },
    });

    // Ensure environment exists
    await getOrCreateEnvironment({
      db,
      userId,
      repoFullName,
    });

    // Update browser automation settings
    await db
      .update(environment)
      .set({
        browserAutomationEnabled: enabled,
        browserConfig: config,
      })
      .where(
        and(
          eq(environment.userId, userId),
          eq(environment.repoFullName, repoFullName),
        ),
      );
  },
  { defaultErrorMessage: "Failed to update browser automation settings" },
);
