import { db } from "@/lib/db";
import { env } from "@dragon/env/apps-www";
import { AIAgent, AIAgentCredentials, AIModel } from "@dragon/agent/types";
import {
  getAgentProviderCredentialsDecrypted,
  getApiOverrideCredentialsForProvider,
} from "@dragon/shared/model/agent-provider-credentials";
import { getCodexCredentialsJSONOrNull } from "@/agent/msg/codexCredentials";
import { getClaudeCredentialsJSONOrNull } from "@/agent/msg/claudeCredentials";
import { ThreadError } from "./error";
import { ClaudeApiOverrideMetadata } from "@dragon/shared/db/types";
import { isKimiOrGlmModel } from "@dragon/agent/utils";

export async function getAndVerifyCredentials({
  agent,
  model: _model,
  userId,
}: {
  agent: AIAgent;
  model: AIModel | null;
  userId: string;
}): Promise<AIAgentCredentials> {
  switch (agent) {
    case "amp": {
      const ampCredentials = await getAgentProviderCredentialsDecrypted({
        db,
        userId,
        agent: "amp",
        encryptionKey: env.ENCRYPTION_MASTER_KEY,
      });
      const ampApiKey = ampCredentials?.apiKey ?? null;
      if (!ampApiKey) {
        throw new ThreadError(
          "missing-amp-credentials",
          "User does not have Amp API key.",
          null,
        );
      }
      return {
        type: "env-var",
        key: "AMP_API_KEY",
        value: ampApiKey,
      };
    }
    case "codex": {
      const codexCredentials = await getCodexCredentialsJSONOrNull({ userId });
      if (codexCredentials.contents) {
        return {
          type: "json-file",
          contents: codexCredentials.contents,
        };
      }
      if (codexCredentials.error) {
        throw new ThreadError(
          "invalid-codex-credentials",
          codexCredentials.error,
          null,
        );
      }
      return {
        type: "built-in-credits",
      };
    }
    case "claudeCode": {
      // Check for Kimi/GLM API override credentials based on model
      if (isKimiOrGlmModel(_model)) {
        const provider = _model === "claude/kimi" ? "kimi" : "glm";
        const overrideCredentials = await getApiOverrideCredentialsForProvider({
          db,
          userId,
          provider,
          encryptionKey: env.ENCRYPTION_MASTER_KEY,
        });
        if (overrideCredentials) {
          return {
            type: "env-vars",
            vars: [
              { key: "ANTHROPIC_API_KEY", value: overrideCredentials.apiKey },
              { key: "ANTHROPIC_BASE_URL", value: overrideCredentials.baseUrl },
            ],
          };
        }
        throw new ThreadError(
          "missing-kimi-glm-credentials",
          `Missing ${provider === "kimi" ? "Kimi" : "GLM"} API credentials. Please add them in Settings > Credentials.`,
          null,
        );
      }

      // Standard Claude credentials
      const claudeCredentials = await getClaudeCredentialsJSONOrNull({
        userId,
      });
      if (claudeCredentials.contents) {
        return {
          type: "json-file",
          contents: claudeCredentials.contents,
        };
      }
      if (claudeCredentials.error) {
        throw new ThreadError(
          "invalid-claude-credentials",
          claudeCredentials.error,
          null,
        );
      }
      return {
        type: "built-in-credits",
      };
    }
    case "gemini": {
      return {
        type: "built-in-credits",
      };
    }
    case "opencode": {
      // Check for API override credentials (Kimi, GLM)
      const opencodeCredentials = await getAgentProviderCredentialsDecrypted({
        db,
        userId,
        agent: "opencode",
        encryptionKey: env.ENCRYPTION_MASTER_KEY,
      });

      // Check for API key (direct) or access token (from subscription/oauth)
      const apiKey =
        opencodeCredentials?.apiKey || opencodeCredentials?.accessToken;

      if (apiKey && opencodeCredentials?.metadata) {
        const metadata =
          opencodeCredentials.metadata as ClaudeApiOverrideMetadata;
        if (metadata.type === "claude-api-override") {
          // Return env vars for the API override
          return {
            type: "env-vars",
            vars: [
              { key: "ANTHROPIC_API_KEY", value: apiKey },
              { key: "ANTHROPIC_BASE_URL", value: metadata.baseUrl },
            ],
          };
        }
      }

      return {
        type: "built-in-credits",
      };
    }
    default: {
      const _exhaustiveCheck: never = agent;
      throw new Error(`Unknown agent: ${_exhaustiveCheck}`);
    }
  }
}
