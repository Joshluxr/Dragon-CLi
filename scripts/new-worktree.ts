#!/usr/bin/env bun
import { $ } from "bun";
import { parseArgs } from "util";
import { existsSync } from "fs";
import path from "path";

const { values: args, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    help: { type: "boolean", short: "h" },
    base: { type: "string", short: "b", default: "main" },
  },
  allowPositionals: true,
});

if (args.help || positionals.length === 0) {
  console.log(`
Usage: bun scripts/new-worktree.ts [options] <branch-name>

Create a new git worktree with a new branch based on main/master.
Automatically copies all relevant environment files to the new worktree.

Options:
  -h, --help              Show this help message
  -b, --base <branch>     Base branch to create from (default: main)

Arguments:
  <branch-name>          Name of the new branch to create

Examples:
  bun scripts/new-worktree.ts feature/new-ui
  bun scripts/new-worktree.ts -b master fix/bug-123
`);
  process.exit(args.help ? 0 : 1);
}

const branchName = positionals[0];
const baseBranch = args.base;

if (!branchName) {
  console.error("Error: Branch name is required");
  process.exit(1);
}

try {
  // Check if we're in a git repository
  await $`git rev-parse --git-dir`.quiet();
} catch {
  console.error("Error: Not in a git repository");
  process.exit(1);
}

try {
  // Check if base branch exists
  try {
    await $`git rev-parse --verify ${baseBranch}`.quiet();
  } catch {
    console.error(`Error: Base branch '${baseBranch}' does not exist`);
    process.exit(1);
  }

  // Check if branch already exists
  try {
    await $`git rev-parse --verify ${branchName}`.quiet();
    console.error(`Error: Branch '${branchName}' already exists`);
    process.exit(1);
  } catch {
    // Branch doesn't exist, which is what we want
  }

  // Create the worktree directory path
  const worktreePath = `../${branchName}`;

  // Create new worktree with new branch
  console.log(
    `Creating worktree for branch '${branchName}' based on '${baseBranch}'...`,
  );
  await $`git worktree add -b ${branchName} ${worktreePath} ${baseBranch}`;

  // Copy environment files to the new worktree
  console.log("📋 Copying environment files...");
  await copyEnvironmentFiles(worktreePath);

  console.log(`✅ Successfully created worktree at: ${worktreePath}`);
  console.log(`📁 To switch to the new worktree: cd ${worktreePath}`);
  console.log(`🌿 New branch '${branchName}' has been created and checked out`);
  console.log(`🔧 Environment files have been copied over`);

  // Open Cursor in the new worktree directory
  console.log(`🚀 Opening Cursor in the new worktree...`);
  try {
    await $`cursor ${worktreePath}`.quiet();
    console.log(`📝 Cursor opened successfully`);
  } catch (error) {
    console.log(`⚠️  Could not open Cursor: ${error.message}`);
    console.log(`💡 You can manually open Cursor with: cursor ${worktreePath}`);
  }
} catch (error) {
  console.error("Error creating worktree:", error.message);
  process.exit(1);
}

async function copyEnvironmentFiles(targetPath: string) {
  // Define all the environment files that should be copied
  const envFiles = [
    // Apps
    "apps/www/.env.development.local",
    "apps/broadcast/.env",
    "apps/cli/.env",
    "apps/vscode-extension/.env",

    // Packages
    "packages/shared/.env",
    "packages/dev-env/.env.development.local",
    "packages/debug-scripts/.env",
    "packages/e2b/.env",
    "packages/r2/.env",
  ];

  let copiedCount = 0;
  let skippedCount = 0;

  for (const envFile of envFiles) {
    const sourcePath = path.resolve(envFile);
    const targetFilePath = path.resolve(targetPath, envFile);
    const targetDir = path.dirname(targetFilePath);

    if (existsSync(sourcePath)) {
      try {
        // Ensure target directory exists
        await $`mkdir -p ${targetDir}`.quiet();

        // Copy the file
        await $`cp ${sourcePath} ${targetFilePath}`.quiet();
        copiedCount++;
        console.log(`  ✅ Copied: ${envFile}`);
      } catch (error) {
        console.log(`  ⚠️  Failed to copy: ${envFile} (${error.message})`);
      }
    } else {
      skippedCount++;
      console.log(`  ⏭️  Skipped: ${envFile} (file not found)`);
    }
  }

  console.log(
    `📊 Summary: ${copiedCount} files copied, ${skippedCount} files skipped`,
  );
}
