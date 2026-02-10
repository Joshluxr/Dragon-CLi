#!/bin/bash
# Dragon VPS Setup Script
# Run this script on your VPS as root after cloning the repository
# Usage: ./scripts/vps-setup.sh [dragon-repo-path]

set -e

DRAGON_PATH="${1:-/opt/dragon}"
COMPOSE_DIR="${DRAGON_PATH}/packages/dev-env"

echo "=============================================="
echo "  Dragon VPS Setup"
echo "=============================================="

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "Cannot detect OS. Please run manually."
    exit 1
fi

echo "Detected OS: $OS"

# Install dependencies (Ubuntu/Debian)
install_deps() {
    echo ""
    echo ">>> Installing system dependencies..."
    apt-get update -qq
    apt-get install -y -qq curl git ca-certificates gnupg
    
    # Node.js 20
    if ! command -v node &> /dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
        echo "Installing Node.js 20..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y -qq nodejs
    fi
    echo "Node: $(node -v)"
    
    # pnpm
    if ! command -v pnpm &> /dev/null; then
        echo "Installing pnpm..."
        npm install -g pnpm@10.14.0
    fi
    echo "pnpm: $(pnpm -v)"
    
    # Docker
    if ! command -v docker &> /dev/null; then
        echo "Installing Docker..."
        curl -fsSL https://get.docker.com | sh
        systemctl enable docker
        systemctl start docker
    fi
    echo "Docker: $(docker -v)"
    
    # Docker Compose plugin
    if ! docker compose version &> /dev/null; then
        apt-get install -y -qq docker-compose-plugin
    fi
}

# Setup project
setup_project() {
    echo ""
    echo ">>> Setting up project at $DRAGON_PATH..."
    
    if [ ! -d "$DRAGON_PATH" ]; then
        echo "ERROR: Directory $DRAGON_PATH not found."
        echo "Please clone the repository first:"
        echo "  git clone https://github.com/dragonlabs/dragon.git $DRAGON_PATH"
        exit 1
    fi
    
    cd "$DRAGON_PATH"
    
    echo "Installing pnpm dependencies..."
    pnpm install
}

# Setup environment files
setup_env() {
    echo ""
    echo ">>> Setting up environment files..."
    
    cd "$DRAGON_PATH"
    
    # Create env files from examples if they don't exist
    for src in "packages/dev-env/.env.example" "packages/shared/.env.example" "apps/broadcast/.env.example"; do
        dest="${src%.example}.development.local"
        if [ "$src" = "packages/shared/.env.example" ]; then
            dest="packages/shared/.env.development.local"
        fi
        if [ "$src" = "apps/broadcast/.env.example" ]; then
            dest="apps/broadcast/.env"
        fi
        if [ ! -f "$dest" ]; then
            cp "$src" "$dest" 2>/dev/null || true
        fi
    done
    
    # apps/www needs special handling - copy .env.example to .env.development.local
    if [ ! -f "apps/www/.env.development.local" ]; then
        cp apps/www/.env.example apps/www/.env.development.local 2>/dev/null || true
    fi
    
    echo ""
    echo "IMPORTANT: Edit the following files with your production credentials:"
    echo "  - apps/www/.env.development.local"
    echo "  - packages/shared/.env.development.local"
    echo "  - apps/broadcast/.env"
    echo ""
    echo "Required variables for production:"
    echo "  DATABASE_URL, REDIS_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL"
    echo "  ANTHROPIC_API_KEY, E2B_API_KEY, OPENAI_API_KEY"
    echo "  GITHUB_APP_ID, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET"
    echo "  R2_*, RESEND_API_KEY, LOCALHOST_PUBLIC_DOMAIN"
    echo "  NEXT_PUBLIC_BROADCAST_HOST, NEXT_PUBLIC_BROADCAST_URL (from PartyKit deploy)"
    echo "  ENCRYPTION_MASTER_KEY, INTERNAL_SHARED_SECRET"
}

# Start infrastructure
start_infrastructure() {
    echo ""
    echo ">>> Starting PostgreSQL and Redis..."
    
    cd "$COMPOSE_DIR"
    
    export ENV=production
    export POSTGRES_PORT=5432
    export REDIS_PORT=6379
    export REDIS_HTTP_PORT=8079
    export REDIS_HTTP_TOKEN="${REDIS_HTTP_TOKEN:-$(openssl rand -hex 16)}"
    
    docker compose --project-name dragon-prod up -d
    
    echo "Waiting for PostgreSQL to be ready..."
    sleep 5
    until docker compose exec -T postgres pg_isready -U postgres 2>/dev/null; do
        sleep 2
    done
    echo "PostgreSQL is ready."
}

# Push database schema
push_schema() {
    echo ""
    echo ">>> Pushing database schema..."
    
    cd "$DRAGON_PATH"
    
    # Ensure shared package has DATABASE_URL in .env.development.local
    SHARED_ENV="packages/shared/.env.development.local"
    if [ ! -f "$SHARED_ENV" ]; then
        echo "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dragon" > "$SHARED_ENV"
    elif ! grep -q "DATABASE_URL=" "$SHARED_ENV" 2>/dev/null; then
        echo "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dragon" >> "$SHARED_ENV"
    fi
    
    pnpm -C packages/shared drizzle-kit-push-dev
}

# Build application (requires env vars - may need to run after configuring)
build_app() {
    echo ""
    echo ">>> Building application..."
    
    cd "$DRAGON_PATH"
    
    # Build bundled first (required for sandbox)
    pnpm exec turbo build --filter=@dragon/bundled
    
    # Build www - may fail if required env vars not set
    if pnpm exec turbo build --filter=@dragon/www 2>/dev/null; then
        echo "Build completed successfully."
    else
        echo "WARNING: www build failed (likely missing env vars)."
        echo "Configure apps/www/.env.development.local and run:"
        echo "  pnpm exec turbo build --filter=@dragon/www"
    fi
}

# Create PM2 ecosystem file
create_pm2_config() {
    echo ""
    echo ">>> Creating PM2 process manager config..."
    
    cat > "$DRAGON_PATH/ecosystem.config.cjs" << 'ECOSYSTEM'
module.exports = {
  apps: [
    {
      name: "dragon-www",
      cwd: "./apps/www",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      env: { NODE_ENV: "production" },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
    },
    {
      name: "dragon-cron",
      cwd: "./apps/www",
      script: "pnpm",
      args: "dev:cron",
      env: { NODE_ENV: "production" },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
    },
  ],
};
ECOSYSTEM
    
    echo "PM2 config created at ecosystem.config.cjs"
    echo ""
    echo "Note: Broadcast (WebSocket) runs on PartyKit cloud. Deploy with:"
    echo "  cd apps/broadcast && pnpm partykit deploy"
}

# Main
main() {
    install_deps
    setup_project
    setup_env
    start_infrastructure
    push_schema
    build_app
    create_pm2_config
    
    echo ""
    echo "=============================================="
    echo "  Setup complete!"
    echo "=============================================="
    echo ""
    echo "Next steps:"
    echo "1. Edit apps/www/.env.development.local with your production credentials"
    echo "2. Set BETTER_AUTH_URL to your public URL (e.g. https://yourdomain.com)"
    echo "3. Set LOCALHOST_PUBLIC_DOMAIN to your public URL (sandboxes need this)"
    echo "4. Deploy broadcast: cd apps/broadcast && pnpm partykit deploy"
    echo "5. Set NEXT_PUBLIC_BROADCAST_HOST and NEXT_PUBLIC_BROADCAST_URL from PartyKit deploy output"
    echo "6. Install PM2: npm install -g pm2"
    echo "7. Start app: cd $DRAGON_PATH && pm2 start ecosystem.config.cjs"
    echo "8. Setup optional: nginx reverse proxy, SSL (certbot)"
    echo ""
    echo "Default app URL: http://localhost:3000"
}

main "$@"
