import { db } from "@/lib/db";
import { env } from "@dragon/env/apps-www";
import { AIAgent, AIAgentCredentials, AIModel } from "@dragon/agent/types";
import { getAgentProviderCredentialsDecrypted } from "@dragon/shared/model/agent-provider-credentials";
import { getCodexCredentialsJSONOrNull } from "@/agent/msg/codexCredentials";
import { getClaudeCredentialsJSONOrNull } from "@/agent/msg/claudeCredentials";
import { ThreadError } from "./error";
import {
  ClaudeApiOverrideMetadata,
  MinimaxClaudeApiMetadata,
} from "@dragon/shared/db/types";

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
      const activeClaude = await getAgentProviderCredentialsDecrypted({
        db,
        userId,
        agent: "claudeCode",
        encryptionKey: env.ENCRYPTION_MASTER_KEY,
      });
      const minimaxMeta = activeClaude?.metadata as
        | MinimaxClaudeApiMetadata
        | undefined;
      if (
        minimaxMeta?.type === "minimax-claude-api-override" &&
        activeClaude?.apiKey
      ) {
        const baseUrl = minimaxMeta.baseUrl.trim();
        const modelName = (minimaxMeta.modelName ?? "MiniMax-M2.7").trim();
        return {
          type: "env-vars",
          vars: [
            { key: "ANTHROPIC_BASE_URL", value: baseUrl },
            { key: "ANTHROPIC_AUTH_TOKEN", value: activeClaude.apiKey },
            { key: "API_TIMEOUT_MS", value: "3000000" },
            { key: "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", value: "1" },
            { key: "ANTHROPIC_MODEL", value: modelName },
            { key: "ANTHROPIC_SMALL_FAST_MODEL", value: modelName },
            { key: "ANTHROPIC_DEFAULT_SONNET_MODEL", value: modelName },
            { key: "ANTHROPIC_DEFAULT_OPUS_MODEL", value: modelName },
            { key: "ANTHROPIC_DEFAULT_HAIKU_MODEL", value: modelName },
          ],
        };
      }

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
