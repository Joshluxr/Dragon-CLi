# Self-hosted deployment runbook (Terragon OSS / OpenSandbox)

This document records a real self-hosted deployment on a public VPS (`Ubuntu 22.04`, Docker, Next.js dev mode), the problems encountered, and how they were fixed. It applies to **Dragon**-family monorepos and **Terragon OSS** snapshots that use `@dragon/*` or `@terragon/*` package names interchangeably after renaming.

---

## 1. Environment setup

### Server baseline

- **OS:** Ubuntu 22.04 LTS
- **Stack installed:** Docker (official script), Node.js 20, pnpm (Corepack), Git
- **App:** Terragon OSS cloned to `/root/terragon-oss` (or Dragon monorepo equivalent)

### PostgreSQL / Redis (Docker)

**Issue:** Default `docker-compose` published Postgres and Redis on `0.0.0.0`, which is a common attack vector. A prior incident involved **`host all all all trust`** in `pg_hba` with a public `5432`.

**Fix:**

- Bind ports to **`127.0.0.1`** only in `packages/dev-env/docker-compose.yml` (or Terragon’s `dev-env`).
- Use **`.env.docker`** with strong random **`POSTGRES_PASSWORD`**, **`REDIS_PASSWORD`**, **`REDIS_HTTP_TOKEN`**.
- Run: `docker compose --env-file .env.docker up -d`
- Ensure **`pg_hba.conf`** has no world **`trust`** line for remote hosts.

### Build artifacts for Next.js

**Issue:** `Module not found: Can't resolve '@terragon/bundled'` (or `@dragon/bundled`).

**Cause:** `bundled` package outputs `dist/index.js` only after build; same for **`daemon`** and **`mcp-server`** (`dist/raw.txt`).

**Fix (order matters):**

```bash
pnpm --filter @terragon/daemon build
pnpm --filter @terragon/mcp-server build
pnpm --filter @terragon/bundled build
pnpm --filter @terragon/sandbox-image build
```

Add **`ExecStartPre`** in systemd for `next dev` to run a small script that executes the above before start.

---

## 2. GitHub App / OAuth

**Issue:** Install link 404 — `NEXT_PUBLIC_GITHUB_APP_NAME` was literally `***`, producing `https://github.com/apps/***/…`.

**Fix:** Set **`NEXT_PUBLIC_GITHUB_APP_NAME`** to the real app **slug** (e.g. `dragon-api`), matching **GitHub → Settings → Developer settings → GitHub Apps → Public link**.

**Issue:** Empty **`BETTER_AUTH_SECRET`** / missing **`INTERNAL_SHARED_SECRET`** / **`ENCRYPTION_MASTER_KEY`**.

**Fix:** Generate random values and set in **`apps/www/.env.development.local`**.

**Security:** Never commit client secrets or private keys; rotate anything pasted in chat.

---

## 3. Realtime (PartyKit / broadcast)

**Issue:** `[broadcast] socket error` — browser tried `hostname:1999` while nothing listened.

**Fix:**

- Run PartyKit dev server (`pnpm partykit dev -p 1999`) as a **systemd** service from `apps/broadcast`.
- Set **`NEXT_PUBLIC_BROADCAST_HOST`** and **`NEXT_PUBLIC_BROADCAST_URL`** to the reachable host (e.g. `23.x.x.x:1999` / `http://…:1999`).
- **`apps/broadcast/.env`:** `BETTER_AUTH_URL`, `INTERNAL_SHARED_SECRET` aligned with `www`.
- Open firewall for **1999/tcp** if needed.

---

## 4. Settings UI: Sandbox provider picker hidden

**Issue:** No **Settings → Sandbox** without feature flag **`daytonaOptionsForSandboxProvider`**.

**Fix:**

- **`NEXT_PUBLIC_SHOW_SANDBOX_SETTINGS=true`** shows Sandbox nav + page without that flag.
- **`DEFAULT_SANDBOX_PROVIDER_FOR_USER=opensandbox`** maps user setting **“Default”** to OpenSandbox (env: `DEFAULT_SANDBOX_PROVIDER_FOR_USER`).

---

## 5. Redis / Upstash rate limiting

**Issue:** `Invalid token` on `@upstash/ratelimit` / `evalsha` for sandbox creation.

**Cause:** **`REDIS_URL`** / **`REDIS_TOKEN`** missing in `apps/www`; dev defaults (`redis_dev_token`) did not match **serverless-redis-http** token from **`packages/dev-env/.env.docker`**.

**Fix:**

```env
REDIS_URL=http://127.0.0.1:8079
REDIS_TOKEN=<same as REDIS_HTTP_TOKEN in .env.docker>
```

---

## 6. OpenSandbox integration

### Wrong Docker image name

**Issue:** `Failed to pull image opensandbox-code-interpreter-v1.0.2-large` — template **name** was not a Docker Hub reference.

**Fix:** In **`packages/sandbox-image/templates.json`**, use **`opensandbox/code-interpreter:v1.0.2`** for both small/large OpenSandbox entries. CPU/RAM still differ via provider **`resource`** map. Optional **`OPEN_SANDBOX_IMAGE`** env override.

### Server install

- Python venv + **`opensandbox-server`**, config at **`/etc/opensandbox/sandbox.toml`**
- Set **`eip`** to the server’s **public IP** so sandbox execd endpoints are reachable when using **`use_server_proxy`**
- Bind lifecycle API to **`127.0.0.1:8080`** (not public) + **`api_key`**
- **`OPEN_SANDBOX_USE_SERVER_PROXY=true`** in `www` when Next cannot reach container ports directly

### Code changes (Dragon repo / PR branch)

- New **`SandboxProvider`:** **`opensandbox`**
- **`OpenSandboxProvider`** using **`@alibaba-group/opensandbox`**
- Settings selector + **`getSandboxProvider`** switch
- **`templates.json`** entries for OpenSandbox image

---

## 7. HolyClaude bundle in OpenSandbox sandboxes

**Goal:** After daemon install, clone **HolyClaude** and apply configs / tooling (best-effort) for root-based sandboxes.

**Implementation:** `packages/sandbox/src/holyclaude-opensandbox.ts`, invoked from **`setupSandboxOneTime`** when **`sandboxProvider === "opensandbox"`**.

**Env:** `HOLYCLAUDE_IN_OPEN_SANDBOX`, `HOLYCLAUDE_REPO_URL`, `HOLYCLAUDE_VARIANT`, `HOLYCLAUDE_SKIP_NPM_GLOBALS`.

**Post-install:** **`restartDaemonIfNotRunning`** so the daemon survives long install scripts.

---

## 8. Daemon callback URL (stuck “Waiting for assistant to start”)

**Issue:** Sandbox boot completed (`booting-done`) but no **`assistant.message`** — daemon could not reach the web app.

**Cause:** In development, **`nonLocalhostPublicAppUrl()`** forced **`https://${LOCALHOST_PUBLIC_DOMAIN}`** while the app was **`http://IP:3000`**.

**Fix:**

- **`SANDBOX_PUBLIC_APP_URL=http://YOUR_IP:3000`** (used as-is in dev when set)
- Allow **`LOCALHOST_PUBLIC_DOMAIN`** to be a full URL with explicit scheme

---

## 9. Terragon vs Dragon symbol mismatch

**Issue:** `Export dragonSetupScriptTimeoutMs doesn't exist` — Terragon **`constants.ts`** exports **`terragonSetupScriptTimeoutMs`**.

**Fix:** In Terragon tree, **`setup.ts`** must import **`terragonSetupScriptTimeoutMs`**. When copying files from Dragon → Terragon, run a quick grep for **`dragon`** vs **`terragon`** in sandbox packages.

---

## 10. Claude Code as root: `--dangerously-skip-permissions`

**Issue:** Daemon error:

```text
--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons
```

**Fix (daemon):** If **`id -u`** is **`0`**, use **`--permission-mode acceptEdits`** instead of **`--dangerously-skip-permissions`** for **`allowAll`** (non-plan). Rebuild **`daemon`** and **`bundled`**, restart **`www`**, **new thread** to ship new daemon script.

**Related log noise:** `invalid_api_key` — verify **`ANTHROPIC_API_KEY`** or in-sandbox Claude credentials. **`Failed to decrypt token`** — **`ENCRYPTION_MASTER_KEY`** mismatch vs stored GitHub tokens; reconnect GitHub if needed.

---

## 11. Quick reference: important env vars (`apps/www`)

| Variable                            | Purpose                                                     |
| ----------------------------------- | ----------------------------------------------------------- |
| `SANDBOX_PUBLIC_APP_URL`            | Daemon → app URL in dev (e.g. `http://IP:3000`)             |
| `REDIS_URL` / `REDIS_TOKEN`         | Upstash-compatible REST Redis (match serverless-redis-http) |
| `NEXT_PUBLIC_SHOW_SANDBOX_SETTINGS` | Show Sandbox settings without feature flag                  |
| `DEFAULT_SANDBOX_PROVIDER_FOR_USER` | Maps “Default” to `opensandbox` / `e2b` / etc.              |
| `OPEN_SANDBOX_*`                    | OpenSandbox lifecycle URL, API key, proxy, image override   |
| `HOLYCLAUDE_*`                      | Optional HolyClaude install in OpenSandbox sandboxes        |

---

## 12. systemd units (example names)

- **`terragon-www`** — `next dev` on `0.0.0.0:3000`, `ExecStartPre` workspace builds
- **`terragon-broadcast`** — PartyKit dev on `1999`
- **`opensandbox-server`** — OpenSandbox lifecycle API on `127.0.0.1:8080`

---

_Last updated from deployment work on branch `cursor/ssh-authentication-check-730b`._
