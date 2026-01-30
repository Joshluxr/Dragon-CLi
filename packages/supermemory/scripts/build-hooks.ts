import * as esbuild from "esbuild";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOOKS = [
  "context-hook",
  "prompt-hook",
  "observation-hook",
  "summary-hook",
];

async function build(): Promise<void> {
  const srcDir = path.join(__dirname, "../src/hooks");
  const outDir = path.join(__dirname, "../dist/hooks");

  // Ensure output directory exists
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  for (const hook of HOOKS) {
    const entryPoint = path.join(srcDir, `${hook}.ts`);

    if (!fs.existsSync(entryPoint)) {
      console.warn(`Warning: ${hook}.ts not found, skipping`);
      continue;
    }

    await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      platform: "node",
      target: "node18",
      format: "cjs",
      outfile: path.join(outDir, `${hook}.cjs`),
      external: [], // Bundle everything
      minify: false, // Keep readable for debugging
    });

    console.log(`Built: ${hook}.cjs`);
  }

  console.log("All hooks built successfully");
}

build().catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});
