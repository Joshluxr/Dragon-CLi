#!/bin/bash
# Dragon Sandbox Server Setup
# Run this on the SANDBOX server (e.g. 23.239.108.30) that will host Docker sandboxes.
# The main Dragon app (65.75.200.136) connects via DOCKER_HOST=ssh://root@23.239.108.30
#
# Prerequisites: SSH key from main Dragon server to this server (for DOCKER_HOST=ssh://)

set -e

echo "=============================================="
echo "  Dragon Sandbox Server Setup"
echo "=============================================="

# Install Docker
if ! command -v docker &> /dev/null; then
  echo ">>> Installing Docker..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq curl
  curl -fsSL https://get.docker.com | sh
  apt-get install -y -qq docker-compose-plugin 2>/dev/null || true
  systemctl enable docker 2>/dev/null || true
  systemctl start docker 2>/dev/null || true
fi
echo "Docker: $(docker -v)"

# Pull Dragon sandbox base image
echo ""
echo ">>> Pulling Dragon sandbox base image..."
docker pull ghcr.io/terragon-labs/containers-test || {
  echo "WARN: Failed to pull base image. You may need to push it or use a different registry."
}

# Optional: Enable Docker TCP (2375) for remote access. Use only on trusted networks.
# Uncomment to allow tcp:// connection (less secure than SSH):
# mkdir -p /etc/systemd/system/docker.service.d
# cat > /etc/systemd/system/docker.service.d/override.conf << 'EOF'
# [Service]
# ExecStart=
# ExecStart=/usr/bin/dockerd -H fd:// -H tcp://0.0.0.0:2375
# EOF
# systemctl daemon-reload && systemctl restart docker

echo ""
echo ">>> Setup complete."
echo ""
echo "On the MAIN Dragon server (65.75.200.136), add to .env:"
echo "  DOCKER_HOST=ssh://root@23.239.108.30"
echo ""
echo "Ensure SSH key auth works: ssh root@23.239.108.30 (from main server)"
echo "And set user sandbox preference to 'Local Docker' in Dragon settings."
echo ""
