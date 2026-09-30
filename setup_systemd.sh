#!/usr/bin/env bash
# ==============================================================================
# DynoLLM - Systemd Service Installer (Optional: Auto-start on system boot)
# ==============================================================================
set -e

if [ "$EUID" -ne 0 ]; then
  echo "❌ Please run this script with sudo: sudo ./setup_systemd.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURRENT_USER="${SUDO_USER:-$(whoami)}"

echo "============================================================"
echo "⚙️  Setting up DynoLLM as Systemd Services..."
echo "   User: ${CURRENT_USER}"
echo "   Dir:  ${SCRIPT_DIR}"
echo "============================================================"

# 1. Backend Service
cat <<EOF > /etc/systemd/system/dynollm-backend.service
[Unit]
Description=DynoLLM Backend API Service
After=network.target

[Service]
Type=simple
User=${CURRENT_USER}
WorkingDirectory=${SCRIPT_DIR}
ExecStart=${SCRIPT_DIR}/run_backend.sh
Restart=always
RestartSec=3
Environment=PYTHONUNBUFFERED=1
StandardOutput=append:${SCRIPT_DIR}/logs/backend.log
StandardError=append:${SCRIPT_DIR}/logs/backend.log

[Install]
WantedBy=multi-user.target
EOF

# 2. Frontend Service
cat <<EOF > /etc/systemd/system/dynollm-frontend.service
[Unit]
Description=DynoLLM Frontend Web Dashboard
After=network.target dynollm-backend.service

[Service]
Type=simple
User=${CURRENT_USER}
WorkingDirectory=${SCRIPT_DIR}
ExecStart=${SCRIPT_DIR}/run_frontend.sh
Restart=always
RestartSec=3
StandardOutput=append:${SCRIPT_DIR}/logs/frontend.log
StandardError=append:${SCRIPT_DIR}/logs/frontend.log

[Install]
WantedBy=multi-user.target
EOF

mkdir -p "${SCRIPT_DIR}/logs"
chown -R "${CURRENT_USER}:${CURRENT_USER}" "${SCRIPT_DIR}/logs"

systemctl daemon-reload
systemctl enable dynollm-backend.service
systemctl enable dynollm-frontend.service
systemctl restart dynollm-backend.service
systemctl restart dynollm-frontend.service

echo "============================================================"
echo "✅ DynoLLM systemd services installed and started!"
echo "   • Backend status:  sudo systemctl status dynollm-backend"
echo "   • Frontend status: sudo systemctl status dynollm-frontend"
echo "   • Stop services:   sudo systemctl stop dynollm-backend dynollm-frontend"
echo "   • Start services:  sudo systemctl start dynollm-backend dynollm-frontend"
echo "============================================================"
