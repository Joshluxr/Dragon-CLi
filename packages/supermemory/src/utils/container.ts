import * as path from "path";
import * as fs from "fs";

export interface ProjectInfo {
  containerTag: string;
  projectName: string;
  workingDir: string;
}

export function getProjectInfo(workingDir?: string): ProjectInfo {
  const cwd = workingDir || process.cwd();

  // Try to get project name from package.json
  const packageJsonPath = findPackageJson(cwd);
  let projectName = path.basename(cwd);

  if (packageJsonPath) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      if (pkg.name) {
        projectName = pkg.name;
      }
    } catch {
      // Use directory name as fallback
    }
  }

  // Container tag is based on the root directory
  const containerTag = `project:${sanitizeTag(projectName)}`;

  return {
    containerTag,
    projectName,
    workingDir: cwd,
  };
}

function findPackageJson(dir: string): string | null {
  let current = dir;
  while (current !== path.dirname(current)) {
    const pkgPath = path.join(current, "package.json");
    if (fs.existsSync(pkgPath)) {
      return pkgPath;
    }
    current = path.dirname(current);
  }
  return null;
}

function sanitizeTag(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}
