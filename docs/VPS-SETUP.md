# Dragon VPS Setup Guide

This guide walks you through deploying Dragon on your own VPS (e.g., 65.75.200.136).

## Important Security Notice

**Never share root passwords in chat or commit them to code.** If you've exposed credentials:

1. **Change the root password immediately** after setup
2. **Set up SSH key authentication** and disable password login
3. **Use a non-root user** for running the application

## Prerequisites

- VPS with Ubuntu 22.04+ or Debian 11+
- Root or sudo access
- Domain name (optional but recommended for production)
- API keys for: Anthropic, E2B, OpenAI, GitHub App, Cloudflare R2, etc.

## Quick Setup (Automated)

### 1. SSH into your VPS

```bash
ssh root@65.75.200.136
# Enter your password when prompted
```

### 2. Clone and run setup

```bash
# Clone the repository
git clone https://github.com/dragonlabs/dragon.git /opt/dragon
cd /opt/dragon

# Make script executable and run
chmod +x scripts/vps-setup.sh
./scripts/vps-setup.sh /opt/dragon
```

The script will:

- Install Node.js 20, pnpm, Docker, Git
- Install pnpm dependencies
- Start PostgreSQL and Redis via Docker
- Push database schema
- Build the application
- Create PM2 config for process management

### 3. Configure environment

Edit the environment files with your credentials:

```bash
nano apps/www/.env.development.local
nano packages/shared/.env.development.local
nano apps/broadcast/.env
```

**Critical production variables:**

| Variable                  | Description                                                                                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_URL`         | Your public URL (e.g., `https://yourdomain.com` or `http://65.75.200.136:3000`)                                                                                                          |
| `LOCALHOST_PUBLIC_DOMAIN` | Same as above - sandboxes need this to reach your backend                                                                                                                                |
| `DATABASE_URL`            | `postgresql://postgres:postgres@localhost:5432/dragon` (or 5433 if 5432 in use)                                                                                                          |
| `REDIS_URL`               | `http://localhost:8079` (serverless-redis-http, **not** redis://). For production rate limiting, use [Upstash](https://console.upstash.com) (free tier) to avoid "Invalid token" errors. |
| `REDIS_TOKEN`             | For serverless-redis-http: must match `REDIS_HTTP_TOKEN` in docker-compose (`redis_dev_token` default). For Upstash: token from dashboard.                                               |
| `BETTER_AUTH_SECRET`      | Generate with `openssl rand -base64 32`                                                                                                                                                  |
| `ENCRYPTION_MASTER_KEY`   | 32+ character key for encrypting user data                                                                                                                                               |
| `INTERNAL_SHARED_SECRET`  | Shared secret for internal service auth                                                                                                                                                  |
| `ANTHROPIC_API_KEY`       | Your Anthropic API key                                                                                                                                                                   |
| `E2B_API_KEY`             | Your E2B sandbox API key                                                                                                                                                                 |
| `OPENAI_API_KEY`          | Your OpenAI API key                                                                                                                                                                      |
| `GITHUB_APP_ID`           | GitHub App ID                                                                                                                                                                            |
| `GITHUB_CLIENT_ID`        | GitHub OAuth client ID                                                                                                                                                                   |
| `GITHUB_CLIENT_SECRET`    | GitHub OAuth client secret                                                                                                                                                               |
| `GITHUB_APP_PRIVATE_KEY`  | GitHub App private key (PEM format)                                                                                                                                                      |
| `GITHUB_WEBHOOK_SECRET`   | Generate with `openssl rand -hex 32`                                                                                                                                                     |
| `R2_*`                    | Cloudflare R2 credentials                                                                                                                                                                |
| `RESEND_API_KEY`          | For transactional emails                                                                                                                                                                 |

### 4. Deploy Broadcast (WebSocket)

The broadcast service runs on PartyKit cloud (free tier):

```bash
cd /opt/dragon/apps/broadcast
pnpm partykit deploy
```

Note the deployed URL (e.g., `https://broadcast-xxx.partykit.dev`) and add to www env:

```
NEXT_PUBLIC_BROADCAST_HOST=broadcast-xxx.partykit.dev
NEXT_PUBLIC_BROADCAST_URL=https://broadcast-xxx.partykit.dev
```

### 5. Build and start

```bash
cd /opt/dragon
pnpm exec turbo build --filter=@dragon/www
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # Enable startup on boot
```

### 6. Access the application

- **Direct IP**: http://65.75.200.136:3000
- **With domain**: Configure nginx reverse proxy (see below)

---

## Manual Setup

If you prefer manual steps or the script fails:

### Install dependencies

```bash
apt-get update
apt-get install -y curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install -g pnpm@10.14.0
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin
```

### Start infrastructure

Data is persisted to `/opt/dragon/data/` (PostgreSQL and Redis). Survives container removal and reboots.

```bash
cd /opt/dragon/packages/dev-env
mkdir -p /opt/dragon/data/postgres /opt/dragon/data/redis
ENV=production POSTGRES_DATA_PATH=/opt/dragon/data/postgres REDIS_DATA_PATH=/opt/dragon/data/redis \
  docker compose --project-name dragon-prod up -d
```

### Push schema

```bash
cd /opt/dragon
echo "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dragon" >> packages/shared/.env.development.local
pnpm -C packages/shared drizzle-kit-push-dev
```

### Build

```bash
pnpm exec turbo build --filter=@dragon/bundled --filter=@dragon/www
```

---

## Nginx Reverse Proxy (Recommended)

For production with a domain and SSL:

```bash
apt-get install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/dragon`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/dragon /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d yourdomain.com
```

Then set `BETTER_AUTH_URL=https://yourdomain.com` and `LOCALHOST_PUBLIC_DOMAIN=https://yourdomain.com`.

---

## GitHub App Configuration

For production, update your GitHub App settings:

- **Homepage URL**: `https://yourdomain.com`
- **Callback URL**: `https://yourdomain.com/api/auth/callback/github`
- **Webhook URL**: `https://yourdomain.com/api/webhooks/github`

---

## Firewall

```bash
ufw allow 22    # SSH
ufw allow 80    # HTTP
ufw allow 443   # HTTPS
ufw allow 3000  # Optional: direct app access
ufw enable
```

---

## Data Persistence & Backup

PostgreSQL and Redis data are stored in `/opt/dragon/data/postgres` and `/opt/dragon/data/redis` via bind mounts. Data survives container restarts, removals, and server reboots.

### Backup database

```bash
docker exec dragon_postgres_production pg_dump -U postgres dragon > backup_$(date +%Y%m%d).sql
```

### Restore database

```bash
cat backup_20250101.sql | docker exec -i dragon_postgres_production psql -U postgres dragon
```

### Migrating from named volumes

If you previously used the setup without bind mounts, the data is in Docker volumes. To migrate:

```bash
# List volumes to find the postgres volume name (e.g. dragon-prod_postgres_data)
docker volume ls

# Copy data from the old volume to the new bind mount path
docker run --rm -v <volume_name>:/from -v /opt/dragon/data/postgres:/to alpine sh -c "cp -a /from/. /to/"

# Then start with the new bind mount paths
```

---

## Troubleshooting

### Database connection failed

```bash
docker ps  # Check if postgres container is running
docker logs dragon_postgres_production
```

### Build fails with env errors

Ensure all required variables are set in `apps/www/.env.development.local`. The app uses envsafe and will fail if required vars are missing.

### Sandboxes can't reach backend

- Verify `LOCALHOST_PUBLIC_DOMAIN` is set to your public URL
- Ensure port 3000 is accessible (or use nginx proxy)
- For IP-only access: `http://65.75.200.136:3000`

### PartyKit deploy fails

Ensure you have a PartyKit account. Run `pnpm partykit login` first.

### Redis "Invalid token" / evalsha errors

The serverless-redis-http proxy has limited Redis command support. For production, use [Upstash Redis](https://console.upstash.com) (free tier): create a database, copy `REDIS_URL` and `REDIS_TOKEN` to your env. The app will allow sandbox creation when Redis fails (graceful degradation).

### Stuck on "Provisioning machine"

If tasks hang at "Provisioning machine" with Docker (self-hosted):

- **Quick fix**: Switch to E2B in Settings → Sandbox (Default or E2B) – no self-hosted Docker needed.
- **Docker SSH**: From the main server, test: `DOCKER_HOST=ssh://root@<sandbox-ip> docker ps`. If this hangs, check SSH keys (`ssh root@<sandbox-ip>`) and that the sandbox server is reachable.
- **Logs**: `pm2 logs dragon-www` to see sandbox creation errors.
- **Timeout**: Docker provisioning has a 3‑minute timeout over SSH; then you’ll see an error.

### Self-hosted Docker sandboxes

To run sandboxes on a separate server:

1. On the sandbox server (e.g. 23.239.108.30): run `./scripts/sandbox-server-setup.sh`
2. Set up SSH key from main Dragon server to sandbox server (see `scripts/connect-sandbox-to-dragon.py`)
3. On main server env: `DOCKER_HOST=ssh://root@sandbox-server-ip`
4. In Dragon settings, users select "Docker (self-hosted)"

---

## Post-Setup Security Checklist

- [ ] Change root password
- [ ] Set up SSH keys, disable password auth
- [ ] Create non-root user for app
- [ ] Configure firewall
- [ ] Set up SSL (certbot)
- [ ] Enable automatic security updates
