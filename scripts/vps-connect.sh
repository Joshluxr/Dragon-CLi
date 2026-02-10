#!/bin/bash
# Quick connect helper - run this from your LOCAL machine
# Usage: ./scripts/vps-connect.sh [user@host]
# Example: ./scripts/vps-connect.sh root@65.75.200.136

HOST="${1:-root@65.75.200.136}"

echo "Connecting to $HOST..."
echo ""
echo "After connecting, run these commands to setup Dragon:"
echo "  git clone https://github.com/dragonlabs/dragon.git /opt/dragon"
echo "  cd /opt/dragon && chmod +x scripts/vps-setup.sh"
echo "  ./scripts/vps-setup.sh /opt/dragon"
echo ""
echo "Or if you already have the repo:"
echo "  cd /opt/dragon && ./scripts/vps-setup.sh /opt/dragon"
echo ""
echo "See docs/VPS-SETUP.md for full documentation."
echo ""

ssh "$HOST"
