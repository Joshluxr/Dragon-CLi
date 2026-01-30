import { daemonAsStr, mcpServerAsStr } from "@terragon/bundled";

export function getDaemonFile() {
  return daemonAsStr;
}

export function getMcpServerFile() {
  return mcpServerAsStr;
}

export const sandboxTimeoutMs = 1000 * 60 * 15; // 15 minutes
export const terragonSetupScriptTimeoutMs = 1000 * 60 * 15; // 15 minutes
