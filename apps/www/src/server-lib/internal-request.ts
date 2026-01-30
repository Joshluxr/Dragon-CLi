import { env } from "@terragon/env/apps-www";
import { publicAppUrl } from "@terragon/env/next-public";

export async function internalPOST(path: string) {
  console.log(`internalPOST ${path}`);
  if (path.startsWith("/") || path.startsWith("http")) {
    throw new Error("Path must not start with / or http");
  }
  return fetch(`${publicAppUrl()}/api/internal/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Terragon-Secret": env.INTERNAL_SHARED_SECRET,
    },
  });
}

export async function isAnthropicDownPOST() {
  console.log(`isAnthropicDownPOST`);
  try {
    await fetch(`${env.IS_ANTHROPIC_DOWN_URL}/api/internal/report-issue`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-SECRET": env.IS_ANTHROPIC_DOWN_API_SECRET,
      },
    });
  } catch (error) {
    console.error("Error reporting issue:", error);
  }
}
