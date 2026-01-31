/**
 * Type definitions for Zvec local cache.
 */

export interface CachedMemory {
  id: string;
  content: string;
  embedding: number[];
  memory_type: "static" | "dynamic" | "conversation" | "observation";
  project: string;
  created_at: number;
  updated_at: number;
  synced_at?: number;
  memory_id?: string;
  source: "local" | "supermemory";
  metadata?: Record<string, unknown>;
}

export interface SearchQuery {
  embedding: number[];
  limit?: number;
  filter?: string;
  output_fields?: string[];
  min_score?: number;
}

export interface SearchResult {
  id: string;
  content: string;
  score: number;
  memory_type: string;
  created_at: number;
  memory_id?: string;
  metadata?: Record<string, unknown>;
}

export interface CacheStats {
  item_count: number;
  size_bytes: number;
  last_sync_time: number;
  pending_uploads: number;
  index_completeness: number;
}

export interface SyncState {
  lastSyncTime: number;
  lastSyncResult: SyncResult | null;
  pendingUploads: Map<string, PendingUpload>;
  retryQueue: RetryItem[];
  conflicts: ConflictRecord[];
}

export interface PendingUpload {
  localId: string;
  content: string;
  type: string;
  createdAt: number;
  retries: number;
  lastError?: string;
}

export interface RetryItem {
  operation: "upload" | "download";
  memoryId: string;
  nextRetry: number;
  retries: number;
  maxRetries: number;
}

export interface ConflictRecord {
  memoryId: string;
  localContent: string;
  remoteContent: string;
  localTimestamp: number;
  remoteTimestamp: number;
  resolution: "local" | "remote" | "pending";
  resolvedAt?: number;
}

export interface SyncResult {
  success: boolean;
  uploaded: number;
  downloaded: number;
  conflicts: number;
  errors: string[];
  duration: number;
}

export interface MemoryRouterConfig {
  mode: "hybrid" | "cache-only" | "remote-only";
  cacheEnabled: boolean;
  syncEnabled: boolean;
  syncIntervalMs: number;
  maxCacheSize: number;
  ttlSeconds: number;
}

export interface HealthStatus {
  cacheAvailable: boolean;
  supermemoryOnline: boolean;
  lastSyncTime: number;
  pendingUploads: number;
  cacheItemCount: number;
}

export type SyncTrigger =
  | "session_start"
  | "session_end"
  | "periodic"
  | "manual"
  | "debounced";

export interface PruneResult {
  deleted: number;
  deletedByAge: number;
  deletedBySize: number;
  errors: string[];
}
