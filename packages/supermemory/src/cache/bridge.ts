/**
 * ZvecBridge - Node.js to Python IPC bridge for Zvec operations.
 */

import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as readline from "readline";
import { findPython, getCacheDir } from "./platform";
import type {
  CachedMemory,
  SearchQuery,
  SearchResult,
  CacheStats,
} from "./types";

export interface BridgeConfig {
  pythonPath: string;
  scriptPath: string;
  cacheDir: string;
  dimension: number;
  timeout: number;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

/**
 * Bridge to Python Zvec server via JSON-RPC over stdin/stdout.
 */
export class ZvecBridge {
  private process: ChildProcess | null = null;
  private config: BridgeConfig;
  private requestId = 0;
  private pendingRequests: Map<number, PendingRequest> = new Map();
  private rl: readline.Interface | null = null;
  private startPromise: Promise<void> | null = null;

  constructor(config: Partial<BridgeConfig> = {}) {
    this.config = {
      pythonPath: config.pythonPath || "python3",
      scriptPath:
        config.scriptPath ||
        path.join(__dirname, "../../python/zvec_bridge/server.py"),
      cacheDir: config.cacheDir || getCacheDir(),
      dimension: config.dimension || 768,
      timeout: config.timeout || 30000,
    };
  }

  /**
   * Start the Python bridge process.
   */
  async start(): Promise<void> {
    if (this.process) {
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this._start();
    return this.startPromise;
  }

  private async _start(): Promise<void> {
    const pythonPath = this.config.pythonPath || (await findPython());
    if (!pythonPath) {
      throw new Error("Python not found");
    }

    return new Promise((resolve, reject) => {
      this.process = spawn(
        pythonPath,
        [
          "-m",
          "zvec_bridge.server",
          "--base-dir",
          this.config.cacheDir,
          "--dimension",
          String(this.config.dimension),
        ],
        {
          stdio: ["pipe", "pipe", "pipe"],
          cwd: path.join(__dirname, "../../python"),
          env: {
            ...process.env,
            PYTHONPATH: path.join(__dirname, "../../python"),
          },
        },
      );

      // Set up readline for response parsing
      this.rl = readline.createInterface({
        input: this.process.stdout!,
        crlfDelay: Infinity,
      });

      this.rl.on("line", (line) => {
        this.handleResponse(line);
      });

      // Handle stderr for logging
      this.process.stderr?.on("data", (data) => {
        const msg = data.toString().trim();
        if (msg) {
          console.error(`[ZvecBridge] ${msg}`);
        }
      });

      this.process.on("error", (error) => {
        console.error("[ZvecBridge] Process error:", error);
        reject(error);
      });

      this.process.on("close", (code) => {
        console.log(`[ZvecBridge] Process exited with code ${code}`);
        this.cleanup();
      });

      // Give it a moment to start, then ping to verify
      setTimeout(async () => {
        try {
          const result = await this.call("ping", {});
          if (result === "pong") {
            resolve();
          } else {
            reject(new Error("Bridge ping failed"));
          }
        } catch (error) {
          reject(error);
        }
      }, 500);
    });
  }

  /**
   * Stop the bridge process.
   */
  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    try {
      await this.call("shutdown", {});
    } catch {
      // Ignore shutdown errors
    }

    this.cleanup();
  }

  private cleanup(): void {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    // Reject all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Bridge closed"));
    }
    this.pendingRequests.clear();
    this.startPromise = null;
  }

  /**
   * Check if the bridge is running.
   */
  isRunning(): boolean {
    return this.process !== null;
  }

  /**
   * Call a method on the Python bridge.
   */
  async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    if (!this.process?.stdin) {
      throw new Error("Bridge not running");
    }

    const id = ++this.requestId;
    const request = { id, method, params };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, this.config.timeout);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

      this.process!.stdin!.write(JSON.stringify(request) + "\n");
    });
  }

  private handleResponse(line: string): void {
    try {
      const response = JSON.parse(line);
      const pending = this.pendingRequests.get(response.id);

      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(response.id);

        if (response.error) {
          pending.reject(new Error(response.error));
        } else {
          pending.resolve(response.result);
        }
      }
    } catch (error) {
      console.error("[ZvecBridge] Failed to parse response:", line);
    }
  }

  // Convenience methods

  async openCollection(project: string): Promise<boolean> {
    return this.call<boolean>("open_collection", { project });
  }

  async closeCollection(project: string): Promise<boolean> {
    return this.call<boolean>("close_collection", { project });
  }

  async destroyCollection(project: string): Promise<boolean> {
    return this.call<boolean>("destroy_collection", { project });
  }

  async getStats(project: string): Promise<CacheStats | null> {
    return this.call<CacheStats | null>("get_stats", { project });
  }

  async insert(project: string, memories: CachedMemory[]): Promise<string[]> {
    return this.call<string[]>("insert", { project, memories });
  }

  async update(project: string, memories: CachedMemory[]): Promise<boolean> {
    return this.call<boolean>("update", { project, memories });
  }

  async upsert(project: string, memories: CachedMemory[]): Promise<string[]> {
    return this.call<string[]>("upsert", { project, memories });
  }

  async delete(project: string, ids: string[]): Promise<boolean> {
    return this.call<boolean>("delete", { project, ids });
  }

  async fetch(project: string, ids: string[]): Promise<CachedMemory[]> {
    return this.call<CachedMemory[]>("fetch", { project, ids });
  }

  async search(project: string, query: SearchQuery): Promise<SearchResult[]> {
    return this.call<SearchResult[]>("search", { project, query });
  }

  async getUnsynced(project: string): Promise<CachedMemory[]> {
    return this.call<CachedMemory[]>("get_unsynced", { project });
  }

  async markSynced(
    project: string,
    ids: string[],
    syncTime: number,
    memoryId?: string,
  ): Promise<boolean> {
    return this.call<boolean>("mark_synced", {
      project,
      ids,
      sync_time: syncTime,
      memory_id: memoryId,
    });
  }

  async getRecent(
    project: string,
    limit: number = 50,
  ): Promise<CachedMemory[]> {
    return this.call<CachedMemory[]>("get_recent", { project, limit });
  }

  async getAll(project: string): Promise<CachedMemory[]> {
    return this.call<CachedMemory[]>("get_all", { project });
  }
}
