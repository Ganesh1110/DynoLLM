#!/usr/bin/env bash
# ==============================================================================
# DynoLLM - Backend Launch Script for AWS GPU & Local Servers
# ==============================================================================
set -e

# Resolve directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${SCRIPT_DIR}"
BACKEND_DIR="${PROJECT_ROOT}/backend"

if [ ! -d "${BACKEND_DIR}" ]; then
  echo "❌ Error: backend directory not found at ${BACKEND_DIR}"
  exit 1
fi

echo "============================================================"
echo "⚡ Starting DynoLLM Backend Server..."
echo "============================================================"

# 1. Check Python version (>= 3.11)
PYTHON_BIN=""
for cmd in python3.13 python3.12 python3.11 python3 python; do
  if command -v "$cmd" >/dev/null 2>&1; then
    VER=$("$cmd" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || true)
    MAJOR=$(echo "$VER" | cut -d. -f1)
    MINOR=$(echo "$VER" | cut -d. -f2)
    if [ "$MAJOR" -eq 3 ] && [ "$MINOR" -ge 11 ]; then
      PYTHON_BIN="$cmd"
      echo "✅ Found Python ${VER} (${cmd})"
      break
    fi
  fi
done

if [ -z "$PYTHON_BIN" ]; then
  echo "⚠️ Warning: Python 3.11+ recommended. Falling back to default 'python3'."
  PYTHON_BIN="python3"
fi

# 2. Check GPU Telemetry (NVIDIA)
echo "------------------------------------------------------------"
if command -v nvidia-smi >/dev/null 2>&1; then
  echo "🎮 NVIDIA GPU Detected:"
  nvidia-smi --query-gpu=index,name,driver_version,memory.total --format=csv,noheader | while read -r line; do
    echo "   • GPU $line"
  done
else
  echo "ℹ️  No NVIDIA GPU detected via nvidia-smi (will run in CPU / Unified memory mode)."
fi
echo "------------------------------------------------------------"

# 3. Setup Virtual Environment
cd "${BACKEND_DIR}"

if [ ! -d "venv" ]; then
  echo "📦 Creating virtual environment in ${BACKEND_DIR}/venv..."
  "$PYTHON_BIN" -m venv venv
fi

# Activate venv
# shellcheck disable=SC1091
source venv/bin/activate

# 4. Install / Verify Dependencies
if [ ! -f "venv/.installed" ] || [ requirements.txt -nt "venv/.installed" ]; then
  echo "📥 Installing / Updating backend dependencies from requirements.txt..."
  pip install --upgrade pip
  pip install -r requirements.txt
  touch venv/.installed
  echo "✅ Dependencies installed successfully."
fi

# 5. Environment Defaults for AWS Deployment
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8000}"
export CORS_ORIGINS="${CORS_ORIGINS:-[\"*\"]}"

echo "🌐 Backend Configuration:"
echo "   • Host: ${HOST}"
echo "   • Port: ${PORT}"
echo "   • CORS: ${CORS_ORIGINS}"
echo "   • Swagger Docs: http://${HOST}:${PORT}/docs"
echo "============================================================"
echo "🚀 Launching FastAPI application on ${HOST}:${PORT}..."
echo "============================================================"

# Run uvicorn server
exec python run.py
