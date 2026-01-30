export interface ThreadContextEntry {
  author: string;
  body: string;
}

const DEFAULT_BULLET_PREFIX = "- ";
const DEFAULT_INDENT = "  ";

/**
 * Formats thread context entries into a normalized markdown string so that
 * Slack, GitHub, and other integrations present conversation snippets
 * consistently.
 */
export function formatThreadContext(entries: ThreadContextEntry[]): string {
  if (entries.length === 0) {
    return "";
  }

  const quotePrefix = "> ";
  const firstLinePrefix = `${quotePrefix}${DEFAULT_BULLET_PREFIX}`;
  const continuationPrefix = `${quotePrefix}${DEFAULT_INDENT}`;

  const formattedEntries = entries
    .map(({ author, body }) => {
      const normalizedAuthor = author.trim();
      // Ensure we only add a single "@" prefix.
      const displayAuthor = normalizedAuthor.startsWith("@")
        ? normalizedAuthor
        : `@${normalizedAuthor}`;

      const normalizedBody = (body ?? "").replace(/\r\n/g, "\n");
      const bodyLines =
        normalizedBody === "" ? [""] : normalizedBody.split("\n");

      return bodyLines
        .map((line, index) => {
          if (index === 0) {
            return `${firstLinePrefix}${displayAuthor}: ${line}`.trimEnd();
          }
          return `${continuationPrefix}${line}`.trimEnd();
        })
        .join("\n");
    })
    .filter((entry) => entry !== "");

  return formattedEntries.join("\n");
}
