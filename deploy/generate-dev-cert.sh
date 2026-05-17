#!/bin/sh
# Generate dev self-signed cert for front-nginx HTTPS(W-F6)
# Usage:  bash deploy/generate-dev-cert.sh
# Output: deploy/dev-certs/{fullchain,privkey}.pem
# Trust:  瀏覽器第一次訪 https://127.0.0.1:11443 會 warning、可選 import fullchain.pem 進系統信任

set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CERT_DIR="$SCRIPT_DIR/dev-certs"
mkdir -p "$CERT_DIR"

openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout "$CERT_DIR/privkey.pem" \
  -out    "$CERT_DIR/fullchain.pem" \
  -days 365 \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

chmod 600 "$CERT_DIR/privkey.pem"
chmod 644 "$CERT_DIR/fullchain.pem"

echo "✓ Dev cert generated at $CERT_DIR/"
echo "  - fullchain.pem(public、可 import 進 browser/system trust store)"
echo "  - privkey.pem(只在本機 dev、勿 commit)"
echo ""
echo "驗:openssl x509 -in $CERT_DIR/fullchain.pem -noout -ext subjectAltName"
