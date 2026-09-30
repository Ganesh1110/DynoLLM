#!/usr/bin/env bash
# ==============================================================================
# DynoLLM - Start Background Daemon (Runs even when terminal is closed)
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

LOGS_DIR="${SCRIPT_DIR}/logs"
mkdir -p "${LOGS_DIR}"

BACKEND_PID_FILE="${LOGS_DIR}/backend.pid"
FRONTEND_PID_FILE="${LOGS_DIR}/frontend.pid"
BACKEND_LOG="${LOGS_DIR}/backend.log"
FRONTEND_LOG="${LOGS_DIR}/frontend.log"

echo "============================================================"
echo "⚡ Starting DynoLLM in Background Mode..."
echo "============================================================"

# Helper: check if PID is running
is_running() {
  local pid=$1
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    return 0
  else
    return 1
  fi
}

# 1. Start Backend in Background
if [ -f "${BACKEND_PID_FILE}" ] && is_running "$(cat "${BACKEND_PID_FILE}")"; then
  echo "ℹ️  Backend is already running (PID: $(cat "${BACKEND_PID_FILE}"))."
else
  echo "🚀 Launching Backend in background (logging to logs/backend.log)..."
  nohup ./run_backend.sh > "${BACKEND_LOG}" 2>&1 &
  BACKEND_PID=$!
  echo "${BACKEND_PID}" > "${BACKEND_PID_FILE}"
  disown "${BACKEND_PID}" 2>/dev/null || true
  echo "✅ Backend started (PID: ${BACKEND_PID})"
fi

# 2. Start Frontend in Background
if [ -f "${FRONTEND_PID_FILE}" ] && is_running "$(cat "${FRONTEND_PID_FILE}")"; then
  echo "ℹ️  Frontend is already running (PID: $(cat "${FRONTEND_PID_FILE}"))."
else
  echo "🚀 Launching Frontend in background (logging to logs/frontend.log)..."
  nohup ./run_frontend.sh > "${FRONTEND_LOG}" 2>&1 &
  FRONTEND_PID=$!
  echo "${FRONTEND_PID}" > "${FRONTEND_PID_FILE}"
  disown "${FRONTEND_PID}" 2>/dev/null || true
  echo "✅ Frontend started (PID: ${FRONTEND_PID})"
fi

# 3. Quick Health Check (Wait 2s)
echo "⏳ Waiting for services to initialize..."
sleep 2

# Detect AWS Public IP if available
PUBLIC_IP=""
if command -v curl >/dev/null 2>&1; then
  TOKEN=$(curl -s -m 1 -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)
  if [ -n "$TOKEN" ]; then
    PUBLIC_IP=$(curl -s -m 1 -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || true)
  fi
  if [ -z "$PUBLIC_IP" ]; then
    PUBLIC_IP=$(curl -s -m 1 http://checkip.amazonaws.com 2>/dev/null || true)
  fi
fi

echo "============================================================"
echo "🎉 DynoLLM is running in the background!"
echo "   You can safely close this terminal or disconnect SSH."
echo "============================================================"
echo "👉 Access the Web Dashboard:"
echo "   • Local URL:   http://localhost:5173"
if [ -n "$PUBLIC_IP" ]; then
  echo "   • AWS Web UI:  http://${PUBLIC_IP}:5173"
  echo "   • Backend API: http://${PUBLIC_IP}:8080/docs"
fi
echo "------------------------------------------------------------"
echo "🛠️  Management Commands:"
echo "   • Check status:     ./status.sh"
echo "   • Stop all:         ./stop.sh"
echo "   • Restart all:      ./restart.sh"
echo "   • Stream logs (BE): tail -f logs/backend.log"
echo "   • Stream logs (FE): tail -f logs/frontend.log"
echo "============================================================"
