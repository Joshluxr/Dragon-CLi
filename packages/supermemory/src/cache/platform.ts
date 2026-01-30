/**
 * Platform detection for Zvec support.
 * Zvec requires Python 3.10-3.12 on Linux x86_64 or macOS ARM64.
 */

import { spawn } from "child_process";
import * as os from "os";

export interface PlatformInfo {
  supported: boolean;
  os: "linux" | "darwin" | "win32" | "other";
  arch: "x64" | "arm64" | "other";
  pythonPath?: string;
  pythonVersion?: string;
  reason?: string;
}

/**
 * Detect the current platform and Python availability.
 */
export async function detectPlatform(): Promise<PlatformInfo> {
  const platform = os.platform();
  const arch = os.arch();

  const info: PlatformInfo = {
    supported: false,
    os:
      platform === "linux" || platform === "darwin" || platform === "win32"
        ? platform
        : "other",
    arch: arch === "x64" || arch === "arm64" ? arch : "other",
  };

  // Check OS/arch support
  if (platform === "linux" && arch === "x64") {
    // Linux x86_64 - supported
  } else if (platform === "darwin" && arch === "arm64") {
    // macOS ARM64 - supported
  } else {
    info.reason = `Unsupported platform: ${platform}/${arch}. Zvec requires Linux x86_64 or macOS ARM64.`;
    return info;
  }

  // Find Python
  const pythonPath = await findPython();
  if (!pythonPath) {
    info.reason = "Python 3.10-3.12 not found";
    return info;
  }

  info.pythonPath = pythonPath;

  // Check Python version
  const version = await getPythonVersion(pythonPath);
  if (!version) {
    info.reason = "Could not determine Python version";
    return info;
  }

  info.pythonVersion = version;

  // Validate version is 3.10-3.12
  const versionParts = version.split(".").map(Number);
  const major = versionParts[0];
  const minor = versionParts[1] ?? 0;
  if (major !== 3 || minor < 10 || minor > 12) {
    info.reason = `Python ${version} not supported. Zvec requires Python 3.10-3.12.`;
    return info;
  }

  info.supported = true;
  return info;
}

/**
 * Find a suitable Python interpreter.
 */
export async function findPython(): Promise<string | null> {
  // Try common Python paths in order of preference
  const candidates = [
    "python3.12",
    "python3.11",
    "python3.10",
    "python3",
    "python",
  ];

  for (const candidate of candidates) {
    const version = await getPythonVersion(candidate);
    if (version) {
      const versionParts = version.split(".").map(Number);
      const major = versionParts[0];
      const minor = versionParts[1] ?? 0;
      if (major === 3 && minor >= 10 && minor <= 12) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * Get Python version string.
 */
async function getPythonVersion(pythonPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const proc = spawn(pythonPath, ["--version"], {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 5000,
      });

      let output = "";
      proc.stdout?.on("data", (data) => {
        output += data.toString();
      });
      proc.stderr?.on("data", (data) => {
        output += data.toString();
      });

      proc.on("close", (code) => {
        if (code === 0) {
          // Parse "Python 3.11.4" -> "3.11.4"
          const match = output.match(/Python (\d+\.\d+\.\d+)/);
          resolve(match?.[1] ?? null);
        } else {
          resolve(null);
        }
      });

      proc.on("error", () => {
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * Check if Zvec is available and can be imported.
 */
export async function checkZvecSupport(): Promise<boolean> {
  const platform = await detectPlatform();
  if (!platform.supported || !platform.pythonPath) {
    return false;
  }

  return new Promise((resolve) => {
    try {
      const proc = spawn(
        platform.pythonPath!,
        ["-c", "import zvec; print('ok')"],
        {
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 10000,
        },
      );

      let output = "";
      proc.stdout?.on("data", (data) => {
        output += data.toString();
      });

      proc.on("close", (code) => {
        resolve(code === 0 && output.trim() === "ok");
      });

      proc.on("error", () => {
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

/**
 * Get the cache directory path.
 */
export function getCacheDir(): string {
  const home = os.homedir();
  return `${home}/.dragon/zvec-cache`;
}
