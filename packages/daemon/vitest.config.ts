import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    silent: "passed-only",
    retry: 2,
    env: {
      ANTHROPIC_API_KEY: "test-api-key-from-env",
    },
  },
});
