"use server";

import { db } from "@/lib/db";
import { userOnlyAction } from "@/lib/auth-server";
import {
  insertAgentProviderCredentials,
  updateAgentProviderCredentialsById,
  deleteAgentProviderCredentialById,
} from "@terragon/shared/model/agent-provider-credentials";
import { getPostHogServer } from "@/lib/posthog-server";
import { env } from "@terragon/env/apps-www";
import { UserFacingError } from "@/lib/server-actions";
import { AIAgent } from "@terragon/agent/types";
import { getAgentProviderCredentials } from "@/server-lib/credentials";
import type {
  ClaudeApiOverrideProvider,
  ClaudeApiOverrideMetadata,
} from "@terragon/shared/db/types";

export const getAgentProviderCredentialsAction = userOnlyAction(
  async function getAgentProviderCredentialsAction(userId: string) {
    return getAgentProviderCredentials({ userId });
  },
  { defaultErrorMessage: "Failed to fetch credentials" },
);

function validateApiKeyFormat({
  apiKey,
  agent,
}: {
  apiKey: string;
  agent: AIAgent;
}) {
  switch (agent) {
    case "amp": {
      if (!apiKey || !apiKey.startsWith("sgamp_user")) {
        throw new UserFacingError("Invalid API key format");
      }
      break;
    }
    case "gemini": {
      if (!apiKey || !apiKey.startsWith("AIza")) {
        throw new UserFacingError("Invalid API key format");
      }
      break;
    }
    case "claudeCode": {
      if (!apiKey || !apiKey.startsWith("sk-ant-")) {
        throw new UserFacingError("Invalid API key format");
      }
      break;
    }
    case "codex": {
      if (!apiKey || !apiKey.startsWith("sk-")) {
        throw new UserFacingError("Invalid API key format");
      }
      break;
    }
  }
}

export const saveAgentProviderApiKey = userOnlyAction(
  async function saveAgentProviderApiKey(
    userId: string,
    { agent, apiKey }: { agent: AIAgent; apiKey: string },
  ) {
    validateApiKeyFormat({ apiKey, agent });
    getPostHogServer().capture({
      distinctId: userId,
      event: "agent_provider_credentials_saved",
      properties: {
        type: "api-key",
        agent,
      },
    });
    await insertAgentProviderCredentials({
      db,
      userId,
      credentialData: {
        type: "api-key",
        agent,
        apiKey,
        isActive: true,
        expiresAt: null,
        lastRefreshedAt: null,
        metadata: null,
      },
      encryptionKey: env.ENCRYPTION_MASTER_KEY,
    });
  },
  { defaultErrorMessage: "Failed to save API key" },
);

export const deleteAgentProviderCredential = userOnlyAction(
  async function deleteAgentProviderCredential(
    userId: string,
    { credentialId }: { credentialId: string },
  ) {
    getPostHogServer().capture({
      distinctId: userId,
      event: "agent_provider_credential_deleted",
      properties: {
        credentialId,
      },
    });
    await deleteAgentProviderCredentialById({ db, userId, credentialId });
  },
  { defaultErrorMessage: "Failed to delete" },
);

export const setAgentProviderCredentialActive = userOnlyAction(
  async function setAgentProviderCredentialActive(
    userId: string,
    { credentialId, isActive }: { credentialId: string; isActive: boolean },
  ) {
    getPostHogServer().capture({
      distinctId: userId,
      event: "agent_provider_credential_updated",
      properties: {
        credentialId,
        isActive,
      },
    });
    await updateAgentProviderCredentialsById({
      db,
      userId,
      credentialId,
      updates: { isActive },
    });
  },
  { defaultErrorMessage: "Failed to update" },
);

// Save API override credentials (Kimi, GLM, etc.)
export const saveApiOverrideCredential = userOnlyAction(
  async function saveApiOverrideCredential(
    userId: string,
    {
      provider,
      apiKey,
      baseUrl,
    }: {
      provider: ClaudeApiOverrideProvider;
      apiKey: string;
      baseUrl: string;
    },
  ) {
    if (!apiKey) {
      throw new UserFacingError("API key is required");
    }
    if (!baseUrl) {
      throw new UserFacingError("Base URL is required");
    }
    const metadata: ClaudeApiOverrideMetadata = {
      type: "claude-api-override",
      provider,
      baseUrl,
    };
    getPostHogServer().capture({
      distinctId: userId,
      event: "agent_provider_credentials_saved",
      properties: {
        type: "api-key",
        agent: "opencode",
        provider,
      },
    });
    await insertAgentProviderCredentials({
      db,
      userId,
      credentialData: {
        type: "api-key",
        agent: "opencode",
        apiKey,
        isActive: true,
        expiresAt: null,
        lastRefreshedAt: null,
        metadata,
      },
      encryptionKey: env.ENCRYPTION_MASTER_KEY,
    });
  },
  { defaultErrorMessage: "Failed to save API override credential" },
);
