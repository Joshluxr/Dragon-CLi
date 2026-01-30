import { readFileSync } from "fs";
import { join } from "path";
import Handlebars from "handlebars";
import type { SandboxProvider } from "@terragon/types/sandbox";

// Register the 'eq' helper
Handlebars.registerHelper("eq", function (a, b) {
  return a === b;
});

const dockerfileHbsPath = join(__dirname, "../Dockerfile.hbs");

export function renderDockerfile(sandboxProvider: SandboxProvider): string {
  const templateContent = readFileSync(dockerfileHbsPath, "utf-8");
  const template = Handlebars.compile(templateContent);
  return template({ sandboxProvider });
}
