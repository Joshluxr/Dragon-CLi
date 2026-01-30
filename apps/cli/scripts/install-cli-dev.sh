#!/bin/bash

# Script to build and install the Toothless CLI as toothless for development

set -e

echo "🚀 Building and installing Toothless CLI as toothless..."

# Get the script directory (apps/cli/scripts)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# Navigate to the CLI directory (parent of scripts)
cd "$SCRIPT_DIR/.."

# Install dependencies if needed
echo "📦 Installing dependencies..."
pnpm install

# Build the CLI
echo "🔨 Building CLI..."
pnpm build

# Create a global link
echo "🔗 Creating global link..."

# Just run npm link - it will use the bin name from package.json
npm link

echo "✅ Toothless CLI installed as toothless!"
echo ""
echo "You can now use the 'toothless' command from anywhere:"
echo "  toothless auth - Authenticate with Dragon"
echo "  toothless pull <threadId> - Pull thread data"
echo ""
echo "To uninstall later, run:"
echo "  npm unlink -g @terragon-labs/cli"