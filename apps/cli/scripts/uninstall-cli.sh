#!/bin/bash

# Script to uninstall the Terry CLI

set -e

echo "🗑️  Uninstalling Terry CLI..."

# Unlink the global package
echo "📦 Removing global link..."
npm unlink -g @terragon-labs/cli

echo "✅ Terry CLI has been uninstalled!"
echo ""
echo "To reinstall, run:"
echo "  pnpm -C apps/cli install:dev"