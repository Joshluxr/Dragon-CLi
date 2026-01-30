import { Supermemory } from "supermemory";
import { getApiKey, isDebugEnabled, loadSettings } from "./utils/settings";
import { getProjectInfo, ProjectInfo } from "./utils/container";
import {
  formatContextForClaude,
  MemoryItem,
  FormattedContext,
} from "./utils/formatter";

export class SupermemoryClient {
  private client: Supermemory | null = null;
  private projectInfo: ProjectInfo;

  constructor(workingDir?: string) {
    this.projectInfo = getProjectInfo(workingDir);
  }

  private getClient(): Supermemory {
    if (!this.client) {
      const apiKey = getApiKey();
      if (!apiKey) {
        throw new Error("SUPERMEMORY_CC_API_KEY environment variable not set");
      }
      this.client = new Supermemory({ apiKey });
    }
    return this.client;
  }

  async getContext(): Promise<FormattedContext> {
    try {
      const settings = loadSettings();
      const profile = await this.getClient().profile({
        containerTag: this.projectInfo.containerTag,
      });

      // Convert profile data to MemoryItem format
      const memories: MemoryItem[] = [
        ...profile.profile.static.map((content, i) => ({
          id: `static_${i}`,
          content,
          metadata: { type: "static" },
        })),
        ...profile.profile.dynamic.map((content, i) => ({
          id: `dynamic_${i}`,
          content,
          metadata: { type: "dynamic" },
        })),
      ];

      return formatContextForClaude(memories, settings.maxProfileItems);
    } catch (error) {
      this.logDebug("Failed to get context:", error);
      return {
        xml: "<supermemory-context><error>Failed to load memories</error></supermemory-context>",
        itemCount: 0,
      };
    }
  }

  async addMemory(
    content: string,
    type: string = "conversation",
  ): Promise<string | null> {
    try {
      const result = await this.getClient().add({
        content,
        containerTag: this.projectInfo.containerTag,
        metadata: {
          type,
          project: this.projectInfo.projectName,
          timestamp: new Date().toISOString(),
        },
      });
      this.logDebug("Memory added:", result.id);
      return result.id;
    } catch (error) {
      this.logDebug("Failed to add memory:", error);
      return null;
    }
  }

  async search(query: string, limit: number = 10): Promise<MemoryItem[]> {
    try {
      const results = await this.getClient().search.memories({
        q: query,
        containerTag: this.projectInfo.containerTag,
        limit,
      });

      // Convert search results to MemoryItem format
      return results.results.map((r) => ({
        id: r.id,
        content: r.memory || r.chunk || "",
        metadata: r.metadata as MemoryItem["metadata"],
        similarity: r.similarity,
      }));
    } catch (error) {
      this.logDebug("Search failed:", error);
      return [];
    }
  }

  getProjectInfo(): ProjectInfo {
    return this.projectInfo;
  }

  private logDebug(...args: unknown[]): void {
    if (isDebugEnabled()) {
      console.log("[Supermemory]", ...args);
    }
  }
}
