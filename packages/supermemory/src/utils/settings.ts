import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface SupermemorySettings {
  skipTools: string[];
  captureTools: string[];
  maxProfileItems: number;
  debug: boolean;
}

const DEFAULT_SETTINGS: SupermemorySettings = {
  skipTools: [],
  captureTools: ["Edit", "Write", "Bash", "Task"],
  maxProfileItems: 50,
  debug: false,
};

function getSettingsDir(): string {
  return path.join(os.homedir(), ".supermemory-claude");
}

function getSettingsFile(): string {
  return path.join(getSettingsDir(), "settings.json");
}

export function loadSettings(): SupermemorySettings {
  try {
    const settingsFile = getSettingsFile();
    if (fs.existsSync(settingsFile)) {
      const content = fs.readFileSync(settingsFile, "utf-8");
      return { ...DEFAULT_SETTINGS, ...JSON.parse(content) };
    }
  } catch (error) {
    // Only check env var here to avoid circular dependency with isDebugEnabled()
    if (process.env.SUPERMEMORY_DEBUG === "true") {
      console.error("[Supermemory] Failed to load settings:", error);
    }
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: Partial<SupermemorySettings>): void {
  try {
    const settingsDir = getSettingsDir();
    const settingsFile = getSettingsFile();
    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }
    const current = loadSettings();
    const updated = { ...current, ...settings };
    fs.writeFileSync(settingsFile, JSON.stringify(updated, null, 2));
  } catch (error) {
    if (isDebugEnabled()) {
      console.error("[Supermemory] Failed to save settings:", error);
    }
  }
}

export function getApiKey(): string | undefined {
  return process.env.SUPERMEMORY_CC_API_KEY;
}

export function isDebugEnabled(): boolean {
  return process.env.SUPERMEMORY_DEBUG === "true" || loadSettings().debug;
}

export function getSkipToolsFromEnv(): string[] {
  const envSkipTools = process.env.SUPERMEMORY_SKIP_TOOLS;
  if (envSkipTools) {
    return envSkipTools.split(",").map((t) => t.trim());
  }
  return [];
}

export { getSettingsDir, getSettingsFile };
