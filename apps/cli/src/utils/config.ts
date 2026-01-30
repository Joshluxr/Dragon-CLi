import { promises as fs } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";

function expandTilde(input: string): string {
  if (!input) return input;
  if (input === "~") return homedir();
  if (input.startsWith("~/")) return join(homedir(), input.slice(2));
  return input;
}

function getSettingsDir(): string {
  const override = process.env.TERRY_SETTINGS_DIR;
  if (override && override.trim().length > 0) {
    return resolve(expandTilde(override.trim()));
  }
  return join(homedir(), ".terry");
}

const CONFIG_DIR = getSettingsDir();
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface Config {
  apiKey?: string;
}

export async function readConfig(): Promise<Config> {
  try {
    const content = await fs.readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export async function getApiKey(): Promise<string | null> {
  const config = await readConfig();
  return config.apiKey || null;
}

export async function saveApiKey(apiKey: string): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  const config = await readConfig();
  config.apiKey = apiKey;
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}
