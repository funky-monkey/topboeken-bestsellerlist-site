#!/usr/bin/env bash
# One-time setup: creates web root, Nginx config, and SSL cert for top-boeken.nl
set -euo pipefail

DOMAIN="top-boeken.nl"
WEBROOT="/var/www/$DOMAIN/html"

echo "=== Creating web root ==="
sudo mkdir -p "$WEBROOT"
sudo chown -R sidney:www-data "$WEBROOT"
sudo chmod -R 755 "/var/www/$DOMAIN"

echo "=== Writing HTTP-only Nginx config (no SSL yet) ==="
sudo tee /etc/nginx/sites-available/$DOMAIN > /dev/null <<'NGINX'
server {
    listen *:80;
    listen [::]:80;
    server_name top-boeken.nl www.top-boeken.nl;
    root /var/www/top-boeken.nl/html;
    index index.html;

    access_log /var/log/nginx/top-boeken.nl.access.log;
    error_log  /var/log/nginx/top-boeken.nl.error.log error;

    include block-rules/letsencrypt;

    location / {
        try_files $uri $uri/ $uri.html =404;
    }
}
NGINX

echo "=== Enabling site ==="
sudo ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN

echo "=== Testing Nginx config ==="
sudo nginx -t

echo "=== Reloading Nginx (HTTP) ==="
sudo systemctl reload nginx

echo "=== Requesting SSL certificate ==="
sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos -m sidney@funky-monkey.nl

echo "=== Reloading Nginx with SSL ==="
sudo systemctl reload nginx

echo ""
echo "Done! https://$DOMAIN should be live."
