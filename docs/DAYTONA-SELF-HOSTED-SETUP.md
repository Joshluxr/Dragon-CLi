# Daytona Self-Hosted Setup for Dragon

This guide sets up Daytona Server on your sandbox server (e.g. 23.239.108.30) so Dragon can use it as a sandbox provider.

## Overview

- **Daytona Server** runs on your sandbox server and manages dev environment sandboxes
- **Dragon** connects via `DAYTONA_API_KEY` and creates sandboxes from snapshots (templates)
- You need to create snapshots on your Daytona Server that match Dragon's expected template IDs

## Prerequisites

- Sandbox server with Docker (e.g. 23.239.108.30)
- Main Dragon server (e.g. 65.75.200.136) that can reach the sandbox server

## 1. Install Daytona Server on Sandbox Server

**Option A: Automated script (from Dragon repo)**

```bash
# From your machine, run via SSH:
cd /path/to/dragon
chmod +x scripts/daytona-server-setup.sh
SANDBOX_SERVER_IP=23.239.108.30 ./scripts/daytona-server-setup.sh
# Or copy to sandbox server and run there
scp scripts/daytona-server-setup.sh root@23.239.108.30:/tmp/
ssh root@23.239.108.30 "SANDBOX_SERVER_IP=23.239.108.30 bash /tmp/daytona-server-setup.sh"
```

**Option B: Manual on sandbox server**

```bash
ssh root@23.239.108.30
# Run the setup script
curl -sL https://raw.githubusercontent.com/your-org/dragon/main/scripts/daytona-server-setup.sh | bash
# Or clone Dragon and run:
# git clone ... && cd dragon && ./scripts/daytona-server-setup.sh
```

**Firewall:** Allow ports 3000 (API), 4000 (proxy), 5556 (OIDC) from the Dragon main server IP.

## 2. Create Snapshots (Templates)

Dragon expects Daytona snapshots with specific resource configs. From the Dragon repo:

```bash
cd /opt/dragon  # or your Dragon clone
pnpm install
cd packages/sandbox-image

# Login to your self-hosted Daytona (replace with your server URL if needed)
daytona login  # or: daytona config set server-url https://your-daytona-server

# Create small and large templates
pnpm create-template:daytona:small
pnpm create-template:daytona:large
```

This creates snapshots in your Daytona Server. Note the snapshot names in `templates.json` (they get added automatically).

## 3. Get API Key

From your Daytona Server:

- **Web UI**: Log in to the Daytona Server UI and create an API key in Settings
- **CLI**: `daytona api-key create` (if supported)

## 4. Configure Dragon

On the main Dragon server (65.75.200.136), add to `apps/www/.env.production.local`:

```bash
DAYTONA_API_KEY=your_api_key_here
```

If your Daytona Server is self-hosted at a custom URL, you may need to set:

```bash
DAYTONA_SERVER_URL=https://23.239.108.30:port  # if SDK supports it
```

Check the `@daytonaio/sdk` package for configuration options.

## 5. Enable Daytona in Dragon

1. **Feature flag**: Daytona is behind `daytonaOptionsForSandboxProvider`. Enable it in the admin feature flags if needed.
2. **User settings**: Settings → Sandbox → select **Daytona**

## 6. Restart Dragon

```bash
pm2 restart ecosystem.config.cjs
```

## Troubleshooting

- **No template found**: Ensure you ran `create-template:daytona:small` and `create-template:daytona:large` and the snapshot names in `templates.json` match what your Daytona Server has.
- **API key invalid**: Verify the key is from your self-hosted Daytona Server, not Daytona Cloud.
- **Connection refused**: Ensure the main Dragon server can reach the Daytona Server (firewall, ports).

## Alternative: Daytona Cloud

If self-hosting is complex, you can use [Daytona Cloud](https://app.daytona.io):

1. Sign up at app.daytona.io
2. Get API key from dashboard
3. Create snapshots via `daytona login` (cloud) + `pnpm create-template:daytona:small`
4. Set `DAYTONA_API_KEY` in Dragon

No server setup required.
