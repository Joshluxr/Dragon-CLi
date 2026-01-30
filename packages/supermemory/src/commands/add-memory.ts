import { SupermemoryClient } from "../client";
import { getApiKey, isDebugEnabled } from "../utils/settings";

async function main(): Promise<void> {
  const content = process.argv[2];

  if (!content) {
    console.log('No content provided. Usage: add-memory "content to save"');
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
    const projectInfo = client.getProjectInfo();

    const memoryId = await client.addMemory(content, "manual");

    if (memoryId) {
      console.log(`Memory saved to project: ${projectInfo.projectName}`);
      console.log(`Memory ID: ${memoryId}`);
    } else {
      console.log("Failed to save memory. Please try again.");
    }
  } catch (error) {
    if (isDebugEnabled()) {
      console.error("Add memory error:", error);
    }
    console.log("Failed to save memory. Please try again.");
    process.exit(1);
  }
}

main();
