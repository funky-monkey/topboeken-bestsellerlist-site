#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Building Astro..."
cd "$APP_DIR"
npm run build

echo "Swapping dist..."
if [ -d "$APP_DIR/dist" ]; then
  mv "$APP_DIR/dist" "$APP_DIR/dist-old"
fi
mv "$APP_DIR/dist-next" "$APP_DIR/dist"
rm -rf "$APP_DIR/dist-old"

echo "Build complete."
