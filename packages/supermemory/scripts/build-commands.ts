import * as esbuild from "esbuild";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COMMANDS = [
  "search-memory",
  "add-memory",
  "cache-status",
  "cache-clear",
  "sync-now",
  "sync-status",
];

async function build(): Promise<void> {
  const srcDir = path.join(__dirname, "../src/commands");
  const outDir = path.join(__dirname, "../dist/commands");

  // Ensure output directory exists
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  for (const cmd of COMMANDS) {
    const entryPoint = path.join(srcDir, `${cmd}.ts`);

    if (!fs.existsSync(entryPoint)) {
      console.warn(`Warning: ${cmd}.ts not found, skipping`);
      continue;
    }

    await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      platform: "node",
      target: "node18",
      format: "cjs",
      outfile: path.join(outDir, `${cmd}.cjs`),
      external: [], // Bundle everything
      minify: false, // Keep readable for debugging
    });

    console.log(`Built: ${cmd}.cjs`);
  }

  console.log("All commands built successfully");
}

build().catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});
