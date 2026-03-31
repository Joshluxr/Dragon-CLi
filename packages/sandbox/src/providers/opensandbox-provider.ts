import {
  BackgroundCommandOptions,
  CreateSandboxOptions,
  ISandboxProvider,
  ISandboxSession,
} from "../types";
import { getTemplateIdForSize } from "@dragon/sandbox-image";
import { retryAsync } from "@dragon/utils/retry";
import {
  ConnectionConfig,
  Sandbox as OpenSandbox,
} from "@alibaba-group/opensandbox";
import { sandboxDefaultLifetimeSec } from "../sandbox-lifetime";

const HOME_DIR = "root";
const REPO_DIR = "repo";
const SLEEP_SEC = sandboxDefaultLifetimeSec;

/** SDK default is 30s — too short for image pull + execd on cold Docker starts. */
const DEFAULT_READY_TIMEOUT_SECONDS = 600;
const DEFAULT_HEALTH_POLL_INTERVAL_MS = 1000;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getOpenSandboxReadinessOptions(): {
  readyTimeoutSeconds: number;
  healthCheckPollingInterval: number;
} {
  return {
    readyTimeoutSeconds: parsePositiveInt(
      process.env.OPEN_SANDBOX_READY_TIMEOUT_SECONDS,
      DEFAULT_READY_TIMEOUT_SECONDS,
    ),
    healthCheckPollingInterval: parsePositiveInt(
      process.env.OPEN_SANDBOX_HEALTH_POLL_INTERVAL_MS,
      DEFAULT_HEALTH_POLL_INTERVAL_MS,
    ),
  };
}

function getOpenSandboxConnection(): ConnectionConfig {
  const domain =
    process.env.OPEN_SANDBOX_DOMAIN ?? process.env.OPENSANDBOX_DOMAIN;
  if (!domain) {
    throw new Error(
      "OPEN_SANDBOX_DOMAIN is not set (OpenSandbox lifecycle API host:port, e.g. 127.0.0.1:8080)",
    );
  }
  const apiKey =
    process.env.OPEN_SANDBOX_API_KEY ?? process.env.OPENSANDBOX_API_KEY;
  const protocol =
    (process.env.OPEN_SANDBOX_PROTOCOL as "http" | "https" | undefined) ??
    "http";
  const useServerProxy =
    process.env.OPEN_SANDBOX_USE_SERVER_PROXY === "true" ||
    process.env.OPEN_SANDBOX_USE_SERVER_PROXY === "1";
  const readyTimeoutSeconds = parsePositiveInt(
    process.env.OPEN_SANDBOX_READY_TIMEOUT_SECONDS,
    DEFAULT_READY_TIMEOUT_SECONDS,
  );
  const requestTimeoutSeconds = parsePositiveInt(
    process.env.OPEN_SANDBOX_REQUEST_TIMEOUT_SECONDS,
    Math.max(120, readyTimeoutSeconds),
  );
  return new ConnectionConfig({
    domain,
    protocol,
    ...(apiKey ? { apiKey } : {}),
    useServerProxy,
    requestTimeoutSeconds,
  });
}

function resourceForSize(size: "small" | "large"): Record<string, string> {
  if (size === "large") {
    return { cpu: "4", memory: "8Gi" };
  }
  return { cpu: "2", memory: "4Gi" };
}

function entrypointForImage(_image: string): string[] | undefined {
  const custom = process.env.OPEN_SANDBOX_ENTRYPOINT;
  if (custom?.trim()) {
    return custom.trim().split(/\s+/);
  }
  if (_image.includes("code-interpreter")) {
    return ["/opt/opensandbox/code-interpreter.sh"];
  }
  return undefined;
}

function stdoutFromExecution(logs: { stdout: { text: string }[] }): string {
  return logs.stdout.map((m) => m.text).join("");
}

class OpenSandboxSession implements ISandboxSession {
  public readonly sandboxProvider = "opensandbox" as const;

  constructor(private sandbox: OpenSandbox) {}

  get homeDir(): string {
    return HOME_DIR;
  }

  get repoDir(): string {
    return REPO_DIR;
  }

  get sandboxId(): string {
    return this.sandbox.id;
  }

  async hibernate(): Promise<void> {
    await this.sandbox.pause();
  }

  async runCommand(
    command: string,
    options?: {
      env?: Record<string, string>;
      cwd?: string;
      timeoutMs?: number;
      onStdout?: (data: string) => void;
      onStderr?: (data: string) => void;
    },
  ): Promise<string> {
    const cwd = options?.cwd ?? REPO_DIR;
    const timeoutSeconds =
      options?.timeoutMs && options.timeoutMs > 0
        ? Math.max(1, Math.ceil(options.timeoutMs / 1000))
        : undefined;
    const exec = await this.sandbox.commands.run(command, {
      workingDirectory: cwd.startsWith("/") ? cwd : `/root/${cwd}`,
      envs: options?.env,
      ...(timeoutSeconds ? { timeoutSeconds } : {}),
      ...(options?.onStdout || options?.onStderr
        ? {
            onStdout: options.onStdout
              ? (m: { text: string }) => options.onStdout!(m.text)
              : undefined,
            onStderr: options.onStderr
              ? (m: { text: string }) => options.onStderr!(m.text)
              : undefined,
          }
        : {}),
    });
    return stdoutFromExecution(exec.logs);
  }

  async runBackgroundCommand(
    command: string,
    options?: BackgroundCommandOptions,
  ): Promise<void> {
    await this.sandbox.commands.run(command, {
      workingDirectory: `/${HOME_DIR}/${REPO_DIR}`,
      background: true,
      envs: options?.env,
      ...(options?.onOutput
        ? {
            onStdout: (m: { text: string }) => options.onOutput!(m.text),
            onStderr: (m: { text: string }) => options.onOutput!(m.text),
          }
        : {}),
      ...(options?.timeoutMs
        ? { timeoutSeconds: Math.max(1, Math.ceil(options.timeoutMs / 1000)) }
        : {}),
    });
  }

  async shutdown(): Promise<void> {
    try {
      await this.sandbox.kill();
    } finally {
      await this.sandbox.close();
    }
  }

  async readTextFile(path: string): Promise<string> {
    return await this.sandbox.files.readFile(path);
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    await this.sandbox.files.writeFiles([{ path, data: content, mode: 0o644 }]);
  }

  async writeFile(path: string, content: Uint8Array): Promise<void> {
    const decoder = new TextDecoder("utf-8", { fatal: false });
    await this.sandbox.files.writeFiles([
      { path, data: decoder.decode(content), mode: 0o644 },
    ]);
  }
}

async function connectWithRetry(
  sandboxId: string,
): Promise<OpenSandboxSession> {
  const connectionConfig = getOpenSandboxConnection();
  const readiness = getOpenSandboxReadinessOptions();
  return await retryAsync(
    async () => {
      const sbx = await OpenSandbox.connect({
        sandboxId,
        connectionConfig,
        ...readiness,
      });
      const session = new OpenSandboxSession(sbx);
      await session.runCommand("echo ok", { cwd: REPO_DIR });
      return session;
    },
    {
      label: `opensandbox connect ${sandboxId}`,
      maxAttempts: 3,
      delayMs: 1500,
    },
  );
}

export class OpenSandboxProvider implements ISandboxProvider {
  async extendLife(sandboxId: string): Promise<void> {
    const connectionConfig = getOpenSandboxConnection();
    const sbx = await OpenSandbox.connect({
      sandboxId,
      connectionConfig,
      skipHealthCheck: true,
    });
    try {
      await sbx.renew(SLEEP_SEC);
    } finally {
      await sbx.close();
    }
  }

  async getSandboxOrNull(sandboxId: string): Promise<ISandboxSession | null> {
    try {
      return await connectWithRetry(sandboxId);
    } catch (e) {
      console.warn(`[opensandbox] failed to resume ${sandboxId}:`, e);
      return null;
    }
  }

  async getOrCreateSandbox(
    sandboxId: string | null,
    options: CreateSandboxOptions,
  ): Promise<ISandboxSession> {
    if (sandboxId) {
      return await connectWithRetry(sandboxId);
    }

    const envs: Record<string, string> = {};
    if (options.environmentVariables) {
      for (const { key, value } of options.environmentVariables) {
        envs[key] = value;
      }
    }

    const image =
      process.env.OPEN_SANDBOX_IMAGE?.trim() ||
      getTemplateIdForSize({
        provider: "opensandbox",
        size: options.sandboxSize,
      });
    const connectionConfig = getOpenSandboxConnection();
    const entrypoint = entrypointForImage(image);
    const readiness = getOpenSandboxReadinessOptions();

    const sandbox = await retryAsync(
      async () =>
        OpenSandbox.create({
          connectionConfig,
          image,
          ...(entrypoint ? { entrypoint } : {}),
          env: envs,
          resource: resourceForSize(options.sandboxSize),
          timeoutSeconds: SLEEP_SEC,
          ...readiness,
        }),
      {
        label: `opensandbox create ${image}`,
        maxAttempts: 3,
        delayMs: 2000,
      },
    );

    return new OpenSandboxSession(sandbox);
  }

  async hibernateById(sandboxId: string): Promise<void> {
    const connectionConfig = getOpenSandboxConnection();
    const sbx = await OpenSandbox.connect({
      sandboxId,
      connectionConfig,
      skipHealthCheck: true,
    });
    try {
      await sbx.pause();
    } finally {
      await sbx.close();
    }
  }
}
