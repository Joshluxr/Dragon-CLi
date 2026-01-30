interface MemoryEntry {
  id: string;
  memory?: string;
  chunk?: string;
  containerTag: string;
  metadata?: Record<string, unknown>;
  similarity?: number;
}

interface SearchObject {
  memories: (params: {
    q: string;
    containerTag: string;
    limit: number;
  }) => Promise<{ results: MemoryEntry[] }>;
}

export class Supermemory {
  private memories: Map<string, MemoryEntry> = new Map();
  private staticProfile: string[] = [];
  private dynamicProfile: string[] = [];

  search: SearchObject;

  constructor(_options: { apiKey: string }) {
    // Bind search object methods
    this.search = {
      memories: this._searchMemories.bind(this),
    };
  }

  async profile(options: {
    containerTag: string;
  }): Promise<{ profile: { static: string[]; dynamic: string[] } }> {
    // Return profile data filtered by container tag
    return {
      profile: {
        static: this.staticProfile,
        dynamic: this.dynamicProfile,
      },
    };
  }

  async add(params: {
    content: string;
    containerTag: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string; status: string }> {
    const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this.memories.set(id, {
      id,
      memory: params.content,
      containerTag: params.containerTag,
      metadata: params.metadata,
    });
    return { id, status: "processing" };
  }

  private async _searchMemories(options: {
    q: string;
    containerTag: string;
    limit: number;
  }): Promise<{ results: MemoryEntry[] }> {
    const results = Array.from(this.memories.values())
      .filter((m) => m.containerTag === options.containerTag)
      .filter((m) =>
        (m.memory || m.chunk || "")
          .toLowerCase()
          .includes(options.q.toLowerCase()),
      )
      .slice(0, options.limit)
      .map((m) => ({ ...m, similarity: 0.85 }));
    return { results };
  }

  // For test setup
  _setProfile(staticItems: string[], dynamicItems: string[]): void {
    this.staticProfile = staticItems;
    this.dynamicProfile = dynamicItems;
  }

  _addTestMemory(memory: MemoryEntry): void {
    this.memories.set(memory.id, memory);
  }

  _clearMemories(): void {
    this.memories.clear();
    this.staticProfile = [];
    this.dynamicProfile = [];
  }
}
