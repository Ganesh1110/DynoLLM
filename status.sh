#!/usr/bin/env bash
# ==============================================================================
# DynoLLM - Status Check for Background Services
# ==============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGS_DIR="${SCRIPT_DIR}/logs"

BACKEND_PID_FILE="${LOGS_DIR}/backend.pid"
FRONTEND_PID_FILE="${LOGS_DIR}/frontend.pid"
BACKEND_LOG="${LOGS_DIR}/backend.log"
FRONTEND_LOG="${LOGS_DIR}/frontend.log"

echo "============================================================"
echo "📊 DynoLLM Service Status"
echo "============================================================"

# 1. Backend Status
ACTIVE_PORT="8080"
HEALTH=""
if command -v curl >/dev/null 2>&1; then
  # Probe 8080 first (production/default)
  HEALTH=$(curl -s -m 2 http://localhost:8080/api/health 2>/dev/null || true)
  if [ -n "$HEALTH" ]; then
    ACTIVE_PORT="8080"
  else
    # Fallback probe 8000 (debug mode)
    DEBUG_HEALTH=$(curl -s -m 2 http://localhost:8000/api/health 2>/dev/null || true)
    if [ -n "$DEBUG_HEALTH" ]; then
      HEALTH="${DEBUG_HEALTH}"
      ACTIVE_PORT="8000"
    fi
  fi
fi

echo "🔹 [Backend - Port ${ACTIVE_PORT}]:"
if [ -f "${BACKEND_PID_FILE}" ]; then
  BE_PID=$(cat "${BACKEND_PID_FILE}")
  if kill -0 "${BE_PID}" 2>/dev/null; then
    echo "   • Status:  🟢 RUNNING (PID: ${BE_PID})"
    if [ -n "$HEALTH" ]; then
      echo "   • Health:  $HEALTH"
    fi
  else
    echo "   • Status:  🔴 DEAD (PID file exists with ${BE_PID}, but process is not alive)"
  fi
else
  echo "   • Status:  ⚪ NOT RUNNING"
fi

# 2. Frontend Status
echo ""
echo "🔹 [Frontend - Port 5173]:"
if [ -f "${FRONTEND_PID_FILE}" ]; then
  FE_PID=$(cat "${FRONTEND_PID_FILE}")
  if kill -0 "${FE_PID}" 2>/dev/null; then
    echo "   • Status:  🟢 RUNNING (PID: ${FE_PID})"
  else
    echo "   • Status:  🔴 DEAD (PID file exists with ${FE_PID}, but process is not alive)"
  fi
else
  echo "   • Status:  ⚪ NOT RUNNING"
fi

# 3. GPU Status
if command -v nvidia-smi >/dev/null 2>&1; then
  echo ""
  echo "🔹 [GPU Telemetry]:"
  nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader | while read -r line; do
    echo "   • $line"
  done
fi

# 4. Recent Logs Preview
echo "------------------------------------------------------------"
echo "📄 Recent Backend Logs (last 5 lines):"
if [ -f "${BACKEND_LOG}" ]; then
  tail -n 5 "${BACKEND_LOG}" | sed 's/^/   /'
else
  echo "   (No log file found)"
fi

echo ""
echo "📄 Recent Frontend Logs (last 5 lines):"
if [ -f "${FRONTEND_LOG}" ]; then
  tail -n 5 "${FRONTEND_LOG}" | sed 's/^/   /'
else
  echo "   (No log file found)"
fi
echo "============================================================"
