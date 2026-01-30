import "dotenv/config";
import { Daytona } from "@daytonaio/sdk";
import { execSync } from "child_process";

async function main() {
  const sandboxId = process.argv[2];
  if (!sandboxId) {
    console.error("Usage: tsx daytona-ssh.ts <sandbox-id>");
    process.exit(1);
  }
  const daytona = new Daytona({ apiKey: process.env.DAYTONA_API_KEY });
  console.log(`Resuming sandbox: ${sandboxId}`);
  const sandbox = await daytona.get(sandboxId);
  await sandbox.start();
  if (sandbox.state === "stopping") {
    await sandbox.waitUntilStopped();
  }
  if (sandbox.state === "restoring" || sandbox.state === "starting") {
    await sandbox.waitUntilStarted();
  } else {
    await sandbox.start();
  }
  console.log(`Connecting to sandbox: ${sandboxId}`);
  const sshAccess = await sandbox.createSshAccess(60 /* expiresInMinutes */);
  execSync(`ssh ${sshAccess.token}@ssh.app.daytona.io`, {
    stdio: "inherit",
  });
}
main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
