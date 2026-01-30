import {
  BackgroundCommandOptions,
  CreateSandboxOptions,
  ISandboxProvider,
  ISandboxSession,
} from "../types";
import { nanoid } from "nanoid/non-secure";

export class MockSession implements ISandboxSession {
  public readonly sandboxProvider: "mock" = "mock";

  constructor(private containerId: string) {}

  get homeDir(): string {
    return "root";
  }

  get repoDir(): string {
    return "repo";
  }

  get sandboxId(): string {
    return this.containerId;
  }

  async hibernate(): Promise<void> {}
  async shutdown(): Promise<void> {}

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
    throw new Error("Not implemented: runCommand");
  }

  async runBackgroundCommand(
    command: string,
    options?: BackgroundCommandOptions,
  ): Promise<void> {
    throw new Error("Not implemented: runBackgroundCommand");
  }

  async readTextFile(filePath: string): Promise<string> {
    throw new Error("Not implemented: readTextFile");
  }

  async writeTextFile(filePath: string, content: string): Promise<void> {
    throw new Error("Not implemented: writeTextFile");
  }

  async writeFile(filePath: string, content: Uint8Array): Promise<void> {
    throw new Error("Not implemented: writeFile");
  }
}

export class MockProvider implements ISandboxProvider {
  constructor() {}

  async getSandboxOrNull(sandboxId: string): Promise<ISandboxSession | null> {
    return new MockSession(sandboxId);
  }

  async getOrCreateSandbox(
    sandboxId: string | null,
    options: CreateSandboxOptions,
  ): Promise<ISandboxSession> {
    return new MockSession(sandboxId ?? nanoid());
  }

  async extendLife(sandboxId: string): Promise<void> {}

  async hibernateById(sandboxId: string): Promise<void> {}
}
