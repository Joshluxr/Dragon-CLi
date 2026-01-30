"use server";

import { userOnlyAction } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { env } from "@terragon/env/apps-www";
import { insertAgentProviderCredentials } from "@terragon/shared/model/agent-provider-credentials";
import { UserFacingError } from "@/lib/server-actions";
import { getPostHogServer } from "@/lib/posthog-server";
import type { ClaudeApiOverrideMetadata } from "@terragon/shared/db/types";

// Simple TOML parser for Kimi config.toml
// Handles basic key-value pairs and sections
function parseKimiConfigToml(tomlContent: string): {
  apiKey?: string;
  baseUrl?: string;
  providerType?: string;
} {
  const lines = tomlContent.split("\n");
  let currentSection = "";
  let apiKey: string | undefined;
  let baseUrl: string | undefined;
  let providerType: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Section header [providers.xxx]
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch && sectionMatch[1]) {
      currentSection = sectionMatch[1];
      continue;
    }

    // Key-value pairs
    const kvMatch = trimmed.match(/^(\w+)\s*=\s*"([^"]*)"$/);
    if (kvMatch && kvMatch[1] && kvMatch[2] !== undefined) {
      const key = kvMatch[1];
      const value = kvMatch[2];
      // Only parse provider sections
      if (currentSection.startsWith("providers.")) {
        switch (key) {
          case "api_key":
            apiKey = value;
            break;
          case "base_url":
            baseUrl = value;
            break;
          case "type":
            providerType = value;
            break;
        }
      }
    }
  }

  return { apiKey, baseUrl, providerType };
}

export const saveKimiConfigToml = userOnlyAction(
  async function saveKimiConfigToml(
    userId: string,
    { configToml }: { configToml: string },
  ) {
    if (!configToml || !configToml.trim()) {
      throw new UserFacingError("Config content is required");
    }

    // Parse the TOML content
    const parsed = parseKimiConfigToml(configToml);

    if (!parsed.apiKey) {
      throw new UserFacingError(
        "No API key found in config.toml. Make sure you have run '/login' in Kimi CLI first.",
      );
    }

    // Validate it's a Kimi provider
    if (parsed.providerType && parsed.providerType !== "kimi") {
      throw new UserFacingError(
        `Expected Kimi provider type, found '${parsed.providerType}'`,
      );
    }

    // Default base URL for Kimi Code
    const baseUrl = parsed.baseUrl || "https://api.kimi.com/coding/v1";

    const metadata: ClaudeApiOverrideMetadata = {
      type: "claude-api-override",
      provider: "kimi",
      baseUrl,
    };

    getPostHogServer().capture({
      distinctId: userId,
      event: "kimi_config_toml_saved",
      properties: {},
    });

    await insertAgentProviderCredentials({
      db,
      userId,
      credentialData: {
        type: "oauth",
        agent: "opencode",
        isActive: true,
        apiKey: parsed.apiKey,
        accessToken: parsed.apiKey,
        expiresAt: null,
        lastRefreshedAt: new Date(),
        metadata,
      },
      encryptionKey: env.ENCRYPTION_MASTER_KEY,
    });
  },
  { defaultErrorMessage: "Failed to save Kimi config.toml" },
);
