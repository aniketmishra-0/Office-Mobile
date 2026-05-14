#!/usr/bin/env bash
# Setup Caddy as a reverse proxy with automatic HTTPS on the GCP VM.
# Run this ONCE on the VM after setup-gcp-vm.sh.
#
# Prerequisites:
#   - A domain pointing to the VM's IP (e.g., 34.24.168.162.nip.io)
#   - Ports 80 and 443 open in GCP firewall
#   - Backend running on localhost:8000

set -euo pipefail

echo "========================================="
echo "Installing Caddy reverse proxy"
echo "========================================="

# Install Caddy (Debian/Ubuntu)
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update
sudo apt-get install -y caddy

# Write Caddyfile
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
34.24.168.162.nip.io {
    reverse_proxy localhost:8000

    # CORS headers are handled by FastAPI, not Caddy
    # Caddy only handles TLS termination and proxying
}
EOF

# Restart Caddy to pick up the new config
sudo systemctl restart caddy
sudo systemctl enable caddy

echo "========================================="
echo "✓ Caddy installed and running!"
echo "  https://34.24.168.162.nip.io → localhost:8000"
echo "========================================="
echo ""
echo "Make sure GCP firewall allows TCP ports 80 and 443:"
echo "  gcloud compute firewall-rules create allow-http --allow tcp:80 --target-tags=http-server"
echo "  gcloud compute firewall-rules create allow-https --allow tcp:443 --target-tags=https-server"
