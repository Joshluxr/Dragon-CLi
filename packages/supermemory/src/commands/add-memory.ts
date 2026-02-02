import { getMemoryRouter } from "../cache/factory";
import { isDebugEnabled } from "../utils/settings";

async function main(): Promise<void> {
  const content = process.argv[2];

  if (!content) {
    console.log('No content provided. Usage: add-memory "content to save"');
    process.exit(1);
  }

  try {
    const router = await getMemoryRouter();
    const projectInfo = router.getProjectInfo();

    const memoryId = await router.addMemory(content, "manual");

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
