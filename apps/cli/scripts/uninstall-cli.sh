#!/bin/bash

# Script to uninstall the Toothless CLI

set -e

echo "🗑️  Uninstalling Toothless CLI..."

# Unlink the global package
echo "📦 Removing global link..."
npm unlink -g @dragon-labs/cli

echo "✅ Toothless CLI has been uninstalled!"
echo ""
echo "To reinstall, run:"
echo "  pnpm -C apps/cli install:dev"