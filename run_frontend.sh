#!/usr/bin/env bash
# ==============================================================================
# DynoLLM - Frontend Launch Script for AWS GPU & Local Servers
# ==============================================================================
set -e

# Resolve directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${SCRIPT_DIR}"
FRONTEND_DIR="${PROJECT_ROOT}/frontend"

if [ ! -d "${FRONTEND_DIR}" ]; then
  echo "❌ Error: frontend directory not found at ${FRONTEND_DIR}"
  exit 1
fi

echo "============================================================"
echo "⚡ Starting DynoLLM Frontend Web Dashboard..."
echo "============================================================"

# 1. Check Node.js and npm
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js is not installed. Please install Node.js 18+ (e.g. via 'nvm' or 'apt install nodejs npm')."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ npm is not installed. Please install npm."
  exit 1
fi

NODE_VER=$(node -v)
echo "✅ Node.js version: ${NODE_VER}"

# 2. Check / Install node_modules
cd "${FRONTEND_DIR}"

if [ ! -d "node_modules" ] || [ package.json -nt "node_modules/.installed" ]; then
  echo "📥 Installing frontend dependencies..."
  npm install
  touch node_modules/.installed
  echo "✅ Frontend packages installed successfully."
fi

# 3. Detect AWS Public IP (optional informational helper)
PUBLIC_IP=""
if command -v curl >/dev/null 2>&1; then
  # Try AWS IMDSv2 token or IMDSv1 with a short 1s timeout
  TOKEN=$(curl -s -m 1 -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)
  if [ -n "$TOKEN" ]; then
    PUBLIC_IP=$(curl -s -m 1 -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)
  fi
  if [ -z "$PUBLIC_IP" ]; then
    PUBLIC_IP=$(curl -s -m 1 http://checkip.amazonaws.com 2>/dev/null || true)
  fi
fi

# 4. Configure Ports and Host Binding
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-5173}"

DEBUG_LOWER=$(echo "${DEBUG:-false}" | tr '[:upper:]' '[:lower:]')
if [ "$DEBUG_LOWER" = "true" ] || [ "$DEBUG_LOWER" = "1" ] || [ "$DEBUG_LOWER" = "yes" ]; then
  export VITE_DEBUG="true"
  DEFAULT_BE_PORT="${BACKEND_PORT:-${PORT_BE:-8000}}"
else
  export VITE_DEBUG="false"
  DEFAULT_BE_PORT="${BACKEND_PORT:-${PORT_BE:-8080}}"
fi
export VITE_API_PORT="${VITE_API_PORT:-${DEFAULT_BE_PORT}}"

echo "🌐 Frontend Configuration:"
echo "   • Host: ${HOST} (Listening on all interfaces for AWS remote access)"
echo "   • Port: ${PORT}"
if [ -n "$VITE_API_URL" ]; then
  echo "   • Explicit API URL: ${VITE_API_URL}"
else
  echo "   • Backend API Target: Port ${VITE_API_PORT} (Debug: ${VITE_DEBUG})"
fi

echo "------------------------------------------------------------"
echo "👉 Access the Dashboard:"
echo "   • Local:   http://localhost:${PORT}"
if [ -n "$PUBLIC_IP" ]; then
  echo "   • AWS IP:  http://${PUBLIC_IP}:${PORT}"
fi
echo "------------------------------------------------------------"
echo "⚠️  AWS Security Group Reminder:"
echo "   Ensure Inbound Rules allow TCP traffic on:"
echo "   - Port 5173 (DynoLLM Frontend Dashboard)"
echo "   - Port ${VITE_API_PORT} (DynoLLM Backend API)"
echo "   - Port 11434 (Ollama, if hosting Ollama on this instance)"
echo "============================================================"
echo "🚀 Launching Vite Dev Server..."
echo "============================================================"

exec npx vite --host "${HOST}" --port "${PORT}"
