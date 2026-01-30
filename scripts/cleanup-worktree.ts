#!/usr/bin/env bun
import { $ } from "bun";
import { parseArgs } from "util";
import { existsSync } from "fs";
import path from "path";

const { values: args, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    help: { type: "boolean", short: "h" },
    force: { type: "boolean", short: "f" },
    list: { type: "boolean", short: "l" },
    all: { type: "boolean", short: "a" },
  },
  allowPositionals: true,
});

if (args.help) {
  console.log(`
Usage: bun scripts/cleanup-worktree.ts [options] [worktree-path|branch-name]

Clean up git worktrees and optionally delete branches.

Options:
  -h, --help              Show this help message
  -f, --force             Force remove worktree even with uncommitted changes
  -l, --list              List all worktrees
  -a, --all               Remove all worktrees except main repository

Arguments:
  [worktree-path]        Path to worktree directory or branch name to remove

Examples:
  bun scripts/cleanup-worktree.ts --list
  bun scripts/cleanup-worktree.ts ../feature-branch
  bun scripts/cleanup-worktree.ts feature/new-ui
  bun scripts/cleanup-worktree.ts --all
  bun scripts/cleanup-worktree.ts --force ../broken-worktree
`);
  process.exit(0);
}

try {
  // Check if we're in a git repository
  await $`git rev-parse --git-dir`.quiet();
} catch {
  console.error("Error: Not in a git repository");
  process.exit(1);
}

async function listWorktrees() {
  try {
    const result = await $`git worktree list --porcelain`.text();
    const worktrees = [];

    const lines = result.trim().split("\n");
    let current: any = {};

    for (const line of lines) {
      if (line === "") {
        if (Object.keys(current).length > 0) {
          worktrees.push(current);
          current = {};
        }
        continue;
      }

      if (line.startsWith("worktree ")) {
        current.path = line.substring("worktree ".length);
      } else if (line.startsWith("HEAD ")) {
        current.head = line.substring("HEAD ".length);
      } else if (line.startsWith("branch ")) {
        current.branch = line
          .substring("branch ".length)
          .replace("refs/heads/", "");
      } else if (line === "bare") {
        current.bare = true;
      } else if (line === "detached") {
        current.detached = true;
      }
    }

    if (Object.keys(current).length > 0) {
      worktrees.push(current);
    }

    return worktrees;
  } catch (error) {
    console.error("Error listing worktrees:", error.message);
    return [];
  }
}

if (args.list) {
  console.log("📋 Current worktrees:");
  const worktrees = await listWorktrees();

  if (worktrees.length === 0) {
    console.log("No worktrees found");
  } else {
    worktrees.forEach((wt, index) => {
      const status = wt.bare ? " (bare)" : wt.detached ? " (detached)" : "";
      const branch = wt.branch ? ` [${wt.branch}]` : "";
      console.log(`${index + 1}. ${wt.path}${branch}${status}`);
    });
  }
  process.exit(0);
}

if (args.all) {
  console.log("🧹 Cleaning up all worktrees...");
  const worktrees = await listWorktrees();

  const mainRepo = worktrees.find((wt) => wt.bare || wt.path === process.cwd());
  const otherWorktrees = worktrees.filter((wt) => wt !== mainRepo);

  if (otherWorktrees.length === 0) {
    console.log("No additional worktrees to clean up");
    process.exit(0);
  }

  let cleaned = 0;
  for (const worktree of otherWorktrees) {
    try {
      console.log(`Removing worktree: ${worktree.path}`);

      if (args.force) {
        await $`git worktree remove --force ${worktree.path}`;
      } else {
        await $`git worktree remove ${worktree.path}`;
      }

      // Optionally delete the branch if it exists and is not checked out elsewhere
      if (worktree.branch) {
        try {
          await $`git branch -d ${worktree.branch}`.quiet();
          console.log(`  ✅ Deleted branch: ${worktree.branch}`);
        } catch {
          console.log(
            `  ⚠️  Could not delete branch: ${worktree.branch} (may have uncommitted changes)`,
          );
        }
      }

      cleaned++;
    } catch (error) {
      console.error(`  ❌ Failed to remove ${worktree.path}: ${error.message}`);
    }
  }

  console.log(`✅ Cleaned up ${cleaned}/${otherWorktrees.length} worktrees`);
  process.exit(0);
}

const target = positionals[0];
if (!target) {
  console.error(
    "Error: Please specify a worktree path, branch name, or use --list/--all options",
  );
  process.exit(1);
}

// Determine if target is a path or branch name
let worktreePath = target;
let branchName: string | null = null;

// Check if target looks like a relative path (starts with ../ or ./)
if (target.startsWith("../") || target.startsWith("./")) {
  worktreePath = path.resolve(target);
} else if (target.startsWith("/")) {
  // Absolute path
  worktreePath = target;
} else {
  // Assume it's a branch name, try to find corresponding worktree
  const worktrees = await listWorktrees();
  const matchingWorktree = worktrees.find((wt) => wt.branch === target);

  if (matchingWorktree) {
    worktreePath = matchingWorktree.path;
    branchName = target;
  } else {
    // Try as a path relative to parent directory
    const potentialPath = path.resolve("..", target);
    if (existsSync(potentialPath)) {
      worktreePath = potentialPath;
    } else {
      console.error(
        `Error: Could not find worktree or branch named '${target}'`,
      );
      process.exit(1);
    }
  }
}

try {
  // Get branch name if not already determined
  if (!branchName) {
    try {
      const worktrees = await listWorktrees();
      const matchingWorktree = worktrees.find(
        (wt) => path.resolve(wt.path) === path.resolve(worktreePath),
      );
      if (matchingWorktree && matchingWorktree.branch) {
        branchName = matchingWorktree.branch;
      }
    } catch {
      // Ignore error, we'll proceed without branch name
    }
  }

  console.log(`🧹 Removing worktree: ${worktreePath}`);

  // Remove the worktree
  if (args.force) {
    await $`git worktree remove --force ${worktreePath}`;
  } else {
    await $`git worktree remove ${worktreePath}`;
  }

  console.log(`✅ Successfully removed worktree: ${worktreePath}`);

  // Optionally delete the branch
  if (branchName) {
    try {
      await $`git branch -d ${branchName}`.quiet();
      console.log(`✅ Successfully deleted branch: ${branchName}`);
    } catch {
      console.log(
        `⚠️  Could not delete branch '${branchName}' (may have uncommitted changes)`,
      );
      console.log(
        `   Use 'git branch -D ${branchName}' to force delete if needed`,
      );
    }
  }
} catch (error) {
  console.error("Error cleaning up worktree:", error.message);
  console.log("\n💡 Troubleshooting:");
  console.log("  - Use --force to remove worktrees with uncommitted changes");
  console.log("  - Use --list to see all available worktrees");
  console.log("  - Ensure the worktree path is correct");
  process.exit(1);
}
