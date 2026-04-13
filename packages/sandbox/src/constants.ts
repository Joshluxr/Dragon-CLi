import { daemonAsStr, mcpServerAsStr } from "@dragon/bundled";

export {
  sandboxDefaultLifetimeMs,
  sandboxDefaultLifetimeSec,
  sandboxTimeoutMs,
} from "./sandbox-lifetime";

export function getDaemonFile() {
  return daemonAsStr;
}

export function getMcpServerFile() {
  return mcpServerAsStr;
}

export const dragonSetupScriptTimeoutMs = 1000 * 60 * 15; // 15 minutes
