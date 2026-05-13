#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$APP_DIR/logs"
LOG_FILE="$LOG_DIR/scrape-$(date +%Y-%m-%d).log"

mkdir -p "$LOG_DIR"
cd "$APP_DIR"

echo "[$(date)] Starting scrape" | tee -a "$LOG_FILE"
node src/scrapers/index.js 2>&1 | tee -a "$LOG_FILE" || echo "[$(date)] Scraper afgerond met fouten — build gaat door" | tee -a "$LOG_FILE"

echo "[$(date)] Scrape done. Starting build" | tee -a "$LOG_FILE"
bash "$SCRIPT_DIR/build.sh" 2>&1 | tee -a "$LOG_FILE"

echo "[$(date)] All done" | tee -a "$LOG_FILE"
