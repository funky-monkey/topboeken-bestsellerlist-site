#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WWW_DIR="/var/www/top-boeken.nl/html"

echo "Applying schema migrations..."
cd "$APP_DIR"
node scripts/migrate.js

echo "Building Astro..."
npm run build

echo "Deploying to $WWW_DIR..."
# Remove Astro-generated page dirs so stale pages don't linger (covers/ stays untouched)
for dir in boeken blog genre lijsten zoeken; do
  rm -rf "$WWW_DIR/$dir"
done
cp -r "$APP_DIR/dist/." "$WWW_DIR/"

echo "Build and deploy complete."
