export interface MemoryItem {
  id: string;
  content: string;
  metadata?: {
    type?: string;
    project?: string;
    timestamp?: string;
    sessionId?: string;
    tags?: string[];
    relevanceHints?: string[];
  };
  similarity?: number;
}

export interface FormattedContext {
  xml: string;
  itemCount: number;
}

export function formatContextForClaude(
  memories: MemoryItem[],
  maxItems: number = 50,
): FormattedContext {
  const limited = memories.slice(0, maxItems);

  if (limited.length === 0) {
    return {
      xml: "<supermemory-context>\n  <note>No previous memories found for this project.</note>\n</supermemory-context>",
      itemCount: 0,
    };
  }

  const items = limited
    .map((mem) => {
      const meta = mem.metadata || {};
      const similarity = mem.similarity
        ? ` similarity="${Math.round(mem.similarity * 100)}%"`
        : "";
      return `  <memory id="${mem.id}"${similarity}>
    <type>${meta.type || "unknown"}</type>
    <content>${escapeXml(mem.content)}</content>
  </memory>`;
    })
    .join("\n");

  return {
    xml: `<supermemory-context>
${items}
</supermemory-context>`,
    itemCount: limited.length,
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function formatSearchResults(
  results: MemoryItem[],
  query: string,
): string {
  if (results.length === 0) {
    return `No memories found for query: "${query}"`;
  }

  const formatted = results
    .map((r, i) => {
      const sim = r.similarity
        ? ` (${Math.round(r.similarity * 100)}% match)`
        : "";
      const preview =
        r.content.length > 500 ? r.content.slice(0, 500) + "..." : r.content;
      return `${i + 1}. ${preview}${sim}`;
    })
    .join("\n\n");

  return `Found ${results.length} memories:\n\n${formatted}`;
}
