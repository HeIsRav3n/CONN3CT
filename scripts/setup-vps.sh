#!/bin/bash
# CONN3CT PNL — Vultr VPS Setup Script
# Run as root on a fresh Ubuntu 22.04 VPS:
#   curl -fsSL https://raw.githubusercontent.com/HeIsRav3n/CONN3CT/master/scripts/setup-vps.sh | bash

set -e

echo "==> Installing Docker..."
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable docker
systemctl start docker
echo "==> Docker installed."

echo "==> Cloning CONN3CT PNL..."
cd /opt
git clone https://github.com/HeIsRav3n/CONN3CT.git conn3ct-pnl
cd conn3ct-pnl
mkdir -p logs

echo ""
echo "======================================"
echo " Paste your .env file contents below."
echo " Press ENTER then Ctrl+D when done."
echo "======================================"
cat > .env

echo "==> Building and starting bot..."
docker compose -f docker-compose.prod.yml up -d --build

echo ""
echo "======================================"
echo " CONN3CT PNL is live!"
echo " Health: http://$(curl -s ifconfig.me):3000/health"
echo "======================================"
echo ""
echo "Useful commands:"
echo "  docker logs -f conn3ct-pnl"
echo "  docker compose -f /opt/conn3ct-pnl/docker-compose.prod.yml restart"
