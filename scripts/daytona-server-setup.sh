#!/bin/bash
# Daytona Server setup for Dragon sandbox provider
# Run on sandbox server (e.g. 23.239.108.30)
# See docs/DAYTONA-SELF-HOSTED-SETUP.md for full guide

set -e

DAYTONA_DIR="${DAYTONA_DIR:-/opt/daytona}"
SANDBOX_IP="${SANDBOX_SERVER_IP:-$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')}"

echo "=============================================="
echo "  Daytona Server Setup for Dragon"
echo "=============================================="

# Ensure Docker is installed
if ! command -v docker &> /dev/null; then
  echo ">>> Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

mkdir -p "$DAYTONA_DIR"
cd "$DAYTONA_DIR"

echo ">>> Downloading Daytona docker-compose..."
curl -sL -o docker-compose.yaml \
  "https://raw.githubusercontent.com/daytonaio/daytona/main/docker/docker-compose.yaml"

# Patch for remote access: PROXY_DOMAIN and PROXY_TEMPLATE_URL (external client access)
# Keep internal hostnames (dex, api, etc.) unchanged for Docker networking
sed -i "s|PROXY_DOMAIN=proxy.localhost:4000|PROXY_DOMAIN=${SANDBOX_IP}:4000|" docker-compose.yaml
sed -i "s|proxy.localhost:4000|${SANDBOX_IP}:4000|g" docker-compose.yaml
sed -i "s|PUBLIC_OIDC_DOMAIN=http://localhost:5556|PUBLIC_OIDC_DOMAIN=http://${SANDBOX_IP}:5556|" docker-compose.yaml
sed -i "s|DASHBOARD_URL=http://localhost:3000|DASHBOARD_URL=http://${SANDBOX_IP}:3000|" docker-compose.yaml
sed -i "s|DASHBOARD_BASE_API_URL=http://localhost:3000|DASHBOARD_BASE_API_URL=http://${SANDBOX_IP}:3000|" docker-compose.yaml

echo ">>> Starting Daytona services (this may take a few minutes)..."
docker compose -f docker-compose.yaml up -d

echo ""
echo ">>> Daytona Server is starting."
echo ""
echo "Access:"
echo "  - Dashboard: http://${SANDBOX_IP}:3000"
echo "  - Default login: dev@daytona.io / password"
echo ""
echo "Next steps:"
echo "  1. Open http://${SANDBOX_IP}:3000 and log in"
echo "  2. Create an API key in Dashboard > Settings > API Keys"
echo "  3. Create snapshots (or use daytona CLI: daytona login, then pnpm create-template:daytona:small)"
echo "  4. Add DAYTONA_API_KEY to Dragon main server's .env.production.local"
echo "  5. If using self-hosted, you may need DAYTONA_SERVER_URL=http://${SANDBOX_IP}:3000 (check SDK docs)"
echo ""
echo "Firewall: allow ports 3000 (API), 4000 (proxy) from Dragon main server."
echo ""
