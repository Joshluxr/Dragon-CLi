export interface HookInput {
  workingDirectory?: string;
  sessionId?: string;
  transcript?: string;
  transcriptPath?: string;
  toolName?: string;
  toolResult?: string;
  userPrompt?: string;
}

export interface HookOutput {
  continue: boolean;
  context?: string;
  error?: string;
}

export async function readStdin(): Promise<HookInput> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
    // Handle case where stdin is empty or already closed
    if (process.stdin.readableEnded) {
      resolve({});
    }
  });
}

export function writeOutput(output: HookOutput): void {
  console.log(JSON.stringify(output));
}
