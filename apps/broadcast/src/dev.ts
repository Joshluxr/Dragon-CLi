/**
 * Partykit dev is a react ink cli and that interacts poorly with concurrently.
 * This script runs the partykit dev command and pipes the output to the console.
 * It also cleans the output to remove ansi escape codes and multiple newlines to
 * play nicely with concurrently.
 */
import stripAnsi from "strip-ansi";
import childProcess from "child_process";

function cleanLine(line: string) {
  line = stripAnsi(line);
  line = line.trim();
  line = line.replace(/\n+/g, "\n");
  return line;
}

function main() {
  const child = childProcess.spawn("pnpm", ["partykit", "dev"], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stdout.on("data", (data) => {
    console.log(cleanLine(data.toString()));
  });

  child.stderr.on("data", (data) => {
    console.error(cleanLine(data.toString()));
  });

  child.on("exit", (code) => {
    process.exit(code);
  });
}

main();
