import { defineConfig } from "tsup";
import { config } from "dotenv";

// Load environment variables from .env files
config();

export default defineConfig({
  entry: ["src/index.tsx"],
  format: ["esm"],
  target: "node20",
  clean: true,
  shims: true,
  bundle: true,
  noExternal: ["@dragon/cli-api-contract"],
  define: {
    "process.env.DRAGON_WEB_URL": JSON.stringify(
      process.env.DRAGON_WEB_URL || "https://www.terragonlabs.com",
    ),
    "process.env.TERRY_NO_AUTO_UPDATE": JSON.stringify(
      process.env.TERRY_NO_AUTO_UPDATE || "0",
    ),
  },
});
