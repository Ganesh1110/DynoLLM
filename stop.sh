#!/usr/bin/env bash
# ==============================================================================
# DynoLLM - Stop Background Services
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGS_DIR="${SCRIPT_DIR}/logs"

BACKEND_PID_FILE="${LOGS_DIR}/backend.pid"
FRONTEND_PID_FILE="${LOGS_DIR}/frontend.pid"

echo "============================================================"
echo "🛑 Stopping DynoLLM Background Services..."
echo "============================================================"

stop_pid() {
  local name=$1
  local pid_file=$2

  if [ -f "${pid_file}" ]; then
    local pid
    pid=$(cat "${pid_file}")
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo "Killing ${name} (PID: ${pid})..."
      kill "$pid" 2>/dev/null || true
      # Wait up to 5s for graceful exit
      for _ in {1..10}; do
        if ! kill -0 "$pid" 2>/dev/null; then
          break
        fi
        sleep 0.5
      done
      # Force kill if still alive
      if kill -0 "$pid" 2>/dev/null; then
        echo "Force killing ${name} (PID: ${pid})..."
        kill -9 "$pid" 2>/dev/null || true
      fi
      echo "✅ ${name} stopped."
    else
      echo "ℹ️  ${name} process (PID: ${pid}) was not running."
    fi
    rm -f "${pid_file}"
  else
    echo "ℹ️  No PID file for ${name}."
  fi
}

stop_pid "Frontend" "${FRONTEND_PID_FILE}"
stop_pid "Backend"  "${BACKEND_PID_FILE}"

# Fallback: clean up any remaining processes bound to ports 8080, 8000 and 5173
if command -v lsof >/dev/null 2>&1; then
  BE_PORT_PID=$(lsof -ti:8080,8000 2>/dev/null || true)
  if [ -n "$BE_PORT_PID" ]; then
    echo "Cleaning up process on port 8080/8000 (PID: ${BE_PORT_PID})..."
    kill -9 $BE_PORT_PID 2>/dev/null || true
  fi

  FE_PORT_PID=$(lsof -ti:5173 2>/dev/null || true)
  if [ -n "$FE_PORT_PID" ]; then
    echo "Cleaning up process on port 5173 (PID: ${FE_PORT_PID})..."
    kill -9 "$FE_PORT_PID" 2>/dev/null || true
  fi
elif command -v fuser >/dev/null 2>&1; then
  fuser -k 8080/tcp 2>/dev/null || true
  fuser -k 8000/tcp 2>/dev/null || true
  fuser -k 5173/tcp 2>/dev/null || true
fi

echo "============================================================"
echo "✅ All DynoLLM services have been stopped."
echo "============================================================"
