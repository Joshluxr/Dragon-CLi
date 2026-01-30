import { spawn, execSync } from "child_process";

// Launch Claude with the specified session ID
export function launchClaude(sessionId: string): void {
  try {
    // Try to find claude using the parent shell
    let claudeCommand = "claude";

    try {
      // Get the parent process shell
      const parentShell = process.env.SHELL || "/bin/sh";
      console.log(`Using parent shell: ${parentShell}`);

      // Run the shell in interactive login mode to load all aliases and PATH
      const shellCommand = `${parentShell} -lic 'which claude 2>/dev/null || type -p claude 2>/dev/null || command -v claude 2>/dev/null'`;
      const result = execSync(shellCommand, {
        encoding: "utf8",
        timeout: 5000,
      }).trim();

      if (result) {
        // Handle alias format: "claude: aliased to /path/to/claude"
        const aliasMatch = result.match(/aliased to (.+)/);
        if (aliasMatch && aliasMatch[1]) {
          claudeCommand = aliasMatch[1].trim();
        } else {
          claudeCommand = result;
        }
        console.log(`Found Claude CLI at: ${claudeCommand}`);
      }
    } catch (error) {
      console.error(
        "Could not locate claude via shell, attempting direct execution",
      );
    }

    const claudeProcess = spawn(claudeCommand, ["--resume", sessionId], {
      stdio: "inherit",
      env: process.env,
      cwd: process.cwd(),
    });

    // Handle errors
    claudeProcess.on("error", (err) => {
      if (err.message.includes("ENOENT")) {
        console.error(
          "Error: 'claude' command not found. Please ensure Claude CLI is installed and in your PATH.",
        );
      } else {
        console.error(`Failed to launch Claude: ${err.message}`);
      }
      process.exit(1);
    });

    // Forward signals to the child process
    const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
    signals.forEach((signal) => {
      process.on(signal, () => {
        claudeProcess.kill(signal);
      });
    });

    // Exit with the same code as the child process
    claudeProcess.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
      } else {
        process.exit(code || 0);
      }
    });
  } catch (err) {
    console.error(
      `Failed to launch Claude: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}
