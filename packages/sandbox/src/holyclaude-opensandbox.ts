import type { CreateSandboxOptions } from "./types";
import type { ISandboxSession } from "./types";
import { bashQuote } from "./utils";

const DEFAULT_REPO = "https://github.com/CoderLuii/HolyClaude.git";

/**
 * Best-effort HolyClaude-style toolchain for OpenSandbox sandboxes (root, /root, repo in ~/repo).
 * Clones HolyClaude config + scripts, copies Claude/Codex/Gemini/Cursor templates from upstream,
 * installs global npm/pip packages and Claude Code CLI (matches upstream Dockerfile intent, not s6/Docker).
 */
const HOLYCLAUDE_MARKER_PATH = "/root/.claude/.holyclaude-opensandbox";

export async function isHolyClaudeOpenSandboxBootstrapDone(
  session: ISandboxSession,
): Promise<boolean> {
  const out = await session
    .runCommand(
      `test -f ${bashQuote(HOLYCLAUDE_MARKER_PATH)} && echo yes || echo no`,
      { cwd: "/" },
    )
    .catch(() => "no");
  return out.trim() === "yes";
}

export async function installHolyClaudeForOpenSandbox(
  session: ISandboxSession,
  options: CreateSandboxOptions,
): Promise<void> {
  if (options.sandboxProvider !== "opensandbox") {
    return;
  }
  const disabled =
    process.env.HOLYCLAUDE_IN_OPEN_SANDBOX === "0" ||
    process.env.HOLYCLAUDE_IN_OPEN_SANDBOX === "false";
  if (disabled) {
    console.log("[holyclaude] skipped (HOLYCLAUDE_IN_OPEN_SANDBOX disabled)");
    return;
  }

  const forceReinstall =
    process.env.HOLYCLAUDE_REINSTALL_OPEN_SANDBOX === "1" ||
    process.env.HOLYCLAUDE_REINSTALL_OPEN_SANDBOX === "true";
  if (!forceReinstall) {
    const markerCheck = await session
      .runCommand(
        `test -f ${bashQuote(HOLYCLAUDE_MARKER_PATH)} && echo installed || echo missing`,
        { cwd: "/" },
      )
      .catch(() => "missing");
    if (markerCheck.trim() === "installed") {
      console.log(
        "[holyclaude] skipping bootstrap (marker present; set HOLYCLAUDE_REINSTALL_OPEN_SANDBOX=1 to force)",
      );
      return;
    }
  }

  const repoUrl = process.env.HOLYCLAUDE_REPO_URL ?? DEFAULT_REPO;
  const variant = process.env.HOLYCLAUDE_VARIANT === "slim" ? "slim" : "full";
  const skipNpm =
    process.env.HOLYCLAUDE_SKIP_NPM_GLOBALS === "1" ||
    process.env.HOLYCLAUDE_SKIP_NPM_GLOBALS === "true";
  const skipNpmFlag = skipNpm ? "1" : "0";

  const gitName = bashQuote(options.userName);
  const gitEmail = bashQuote(options.userEmail);

  const script = `
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
export CI=1
export HOME=/root

echo "[holyclaude] cloning ${repoUrl}"
rm -rf /opt/HolyClaude
git clone --depth 1 ${bashQuote(repoUrl)} /opt/HolyClaude

mkdir -p /usr/local/share/holyclaude
cp /opt/HolyClaude/config/settings.json /usr/local/share/holyclaude/
cp "/opt/HolyClaude/config/claude-memory-${variant}.md" /usr/local/share/holyclaude/claude-memory-${variant}.md
install -m 0755 /opt/HolyClaude/scripts/notify.py /usr/local/bin/notify.py

mkdir -p /root/.claude /root/.codex /root/.gemini /root/.cursor
cp /usr/local/share/holyclaude/settings.json /root/.claude/settings.json
cp "/usr/local/share/holyclaude/claude-memory-${variant}.md" /root/.claude/CLAUDE.md

git config --global user.name ${gitName}
git config --global user.email ${gitEmail}
git config --global safe.directory '*'

# Codex (from HolyClaude bootstrap)
mkdir -p /root/.codex
if [ ! -f /root/.codex/config.toml ]; then
  cat > /root/.codex/config.toml <<'TOML'
approval_policy = "on-request"
sandbox_mode = "workspace-write"

[features]
codex_hooks = true
TOML
fi
if ! grep -q '^\\[features\\]' /root/.codex/config.toml 2>/dev/null; then
  printf '\\n[features]\\ncodex_hooks = true\\n' >> /root/.codex/config.toml
fi
if [ ! -f /root/.codex/hooks.json ]; then
  cat > /root/.codex/hooks.json <<'JSON'
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/usr/local/bin/notify.py stop",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
JSON
fi

# Gemini CLI hooks
mkdir -p /root/.gemini
if [ ! -f /root/.gemini/settings.json ]; then
  cat > /root/.gemini/settings.json <<'JSON'
{
  "hooks": {
    "SessionEnd": [
      {
        "matcher": "*",
        "hooks": [
          {
            "name": "notify",
            "type": "command",
            "command": "/usr/local/bin/notify.py stop",
            "timeout": 30000
          }
        ]
      }
    ]
  }
}
JSON
fi

# Cursor hooks (future CLI)
if [ ! -f /root/.cursor/hooks.json ]; then
  cat > /root/.cursor/hooks.json <<'JSON'
{
  "version": 1,
  "hooks": {
    "stop": [
      {
        "type": "command",
        "command": "/usr/local/bin/notify.py stop",
        "timeout": 30
      }
    ]
  }
}
JSON
fi

touch ${bashQuote(HOLYCLAUDE_MARKER_PATH)}
echo "[holyclaude] config copied"

if command -v apt-get >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends \\
    ca-certificates curl git jq ripgrep fd-find unzip zip tree tmux fzf \\
    build-essential pkg-config python3 python3-pip python3-venv \\
    chromium fonts-liberation2 sudo \\
    postgresql-client redis-tools sqlite3 openssh-client \\
    xvfb imagemagick \\
    freerdp2-x11 \\
    || true
  ln -sf /usr/bin/fdfind /usr/local/bin/fd 2>/dev/null || true
  ln -sf /usr/bin/batcat /usr/local/bin/bat 2>/dev/null || true
elif command -v apk >/dev/null 2>&1; then
  apk add --no-cache curl git bash sudo python3 py3-pip build-base openssh-client \\
    || true
fi

export PATH="/root/.local/bin:$PATH"

if [ "${skipNpmFlag}" != "1" ] && command -v npm >/dev/null 2>&1; then
  echo "[holyclaude] npm globals (may take several minutes)"
  npm i -g --no-fund --no-audit \\
    typescript tsx pnpm vite esbuild eslint prettier \\
    serve nodemon concurrently dotenv-cli \\
    @google/gemini-cli @openai/codex task-master-ai \\
    || true
  if [ "${variant}" = "full" ]; then
    npm i -g --no-fund --no-audit wrangler vercel netlify-cli pm2 \\
      @marp-team/marp-cli \\
      || true
  fi
fi

echo "[holyclaude] pip packages"
if command -v pip3 >/dev/null 2>&1; then
  pip3 install --no-cache-dir --break-system-packages \\
    requests httpx beautifulsoup4 lxml Pillow pandas numpy \\
    openpyxl python-docx jinja2 pyyaml python-dotenv markdown \\
    rich click tqdm playwright apprise \\
    || pip3 install --no-cache-dir \\
      requests httpx beautifulsoup4 lxml Pillow pandas numpy \\
      openpyxl python-docx jinja2 pyyaml python-dotenv markdown \\
      rich click tqdm playwright apprise \\
    || true
fi

echo "[holyclaude] Claude Code CLI"
curl -fsSL https://claude.ai/install.sh | bash || true

echo "[holyclaude] done"
`.trim();

  await session.runCommand(script, {
    cwd: "/",
    timeoutMs: 45 * 60 * 1000,
  });
}
