#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WWW_DIR="/var/www/top-boeken.nl/html"

echo "Building Astro..."
cd "$APP_DIR"
npm run build

echo "Deploying to $WWW_DIR..."
# Copy all dist files, preserving the covers/ directory that lives in www
cp -r "$APP_DIR/dist/." "$WWW_DIR/"

echo "Build and deploy complete."
