import { SupermemoryClient } from "../client";
import { formatSearchResults } from "../utils/formatter";
import { getApiKey, isDebugEnabled } from "../utils/settings";

async function main(): Promise<void> {
  const query = process.argv[2];

  if (!query) {
    console.log(
      "No search query provided. Please specify what you want to search for.",
    );
    process.exit(1);
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    console.log(
      "Supermemory not configured. Set SUPERMEMORY_CC_API_KEY environment variable.",
    );
    process.exit(1);
  }

  try {
    const client = new SupermemoryClient();
    const results = await client.search(query, 10);

    if (results.length === 0) {
      console.log(`No memories found for: "${query}"`);
      console.log(
        "\nTry searching with different terms or check if memories have been saved.",
      );
      return;
    }

    console.log(formatSearchResults(results, query));
  } catch (error) {
    if (isDebugEnabled()) {
      console.error("Search error:", error);
    }
    console.log("Failed to search memories. Please try again.");
    process.exit(1);
  }
}

main();
