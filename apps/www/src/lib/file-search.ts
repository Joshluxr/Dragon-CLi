export interface TreeFile {
  path: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
}

export function searchFilesLocally(
  files: TreeFile[],
  query: string,
): TreeFile[] {
  if (!query) {
    return [];
  }

  const lowerQuery = query.toLowerCase();

  // Score each file based on how well it matches the query
  const scoredFiles = files
    .map((file) => {
      const lowerPath = file.path.toLowerCase();
      const pathParts = file.path.split("/");
      const fileName = pathParts[pathParts.length - 1]?.toLowerCase() || "";
      const isFolder = file.type === "tree";

      let score = 0;

      // Exact filename/folder name match (highest priority)
      if (fileName === lowerQuery) {
        score += 100;
        // Boost folders slightly to make them appear before files with same name
        if (isFolder) score += 5;
      }
      // Filename/folder name starts with query
      else if (fileName.startsWith(lowerQuery)) {
        score += 80;
        if (isFolder) score += 5;
      }
      // Filename/folder name contains query
      else if (fileName.includes(lowerQuery)) {
        score += 60;
        if (isFolder) score += 5;
      }
      // Path contains query
      else if (lowerPath.includes(lowerQuery)) {
        score += 40;
        if (isFolder) score += 5;
      }
      // Fuzzy match - all characters in query appear in order
      else if (fuzzyMatch(lowerPath, lowerQuery)) {
        score += 20;
        if (isFolder) score += 5;
      }

      return { file, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      // Sort by score (descending), then by path length (ascending)
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.file.path.length - b.file.path.length;
    });

  const results = scoredFiles.map((item) => item.file);
  return results;
}

function fuzzyMatch(text: string, query: string): boolean {
  let queryIndex = 0;

  for (let i = 0; i < text.length && queryIndex < query.length; i++) {
    if (text[i] === query[queryIndex]) {
      queryIndex++;
    }
  }

  return queryIndex === query.length;
}
