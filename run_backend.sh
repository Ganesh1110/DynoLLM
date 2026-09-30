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

# Ensure local binary paths (such as ~/.local/bin and ~/.cargo/bin) are in PATH
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

# 1. Check Python version (Supported: Python 3.10 - 3.13)
# Note: Python 3.14 is currently pre-release/unsupported by pydantic-core, greenlet, and PyO3.
PYTHON_BIN="${PYTHON_BIN:-}"

if [ -z "$PYTHON_BIN" ] && command -v uv >/dev/null 2>&1; then
  UV_PY=$(uv python find 3.12 2>/dev/null || uv python find 3.11 2>/dev/null || true)
  if [ -z "$UV_PY" ]; then
    echo "⚡ 'uv' detected! Automatically fetching standalone Python 3.12..."
    uv python install 3.12
    UV_PY=$(uv python find 3.12 2>/dev/null || true)
  fi
  if [ -n "$UV_PY" ]; then
    PYTHON_BIN="$UV_PY"
    echo "✅ Found uv-managed Python (${PYTHON_BIN})"
  fi
fi

if [ -z "$PYTHON_BIN" ]; then
  # Look specifically for stable Python versions first (3.12, 3.11, 3.10, 3.13)
  for cmd in python3.12 python3.11 python3.10 python3.13; do
    if command -v "$cmd" >/dev/null 2>&1; then
      VER=$("$cmd" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || true)
      MAJOR=$(echo "$VER" | cut -d. -f1)
      MINOR=$(echo "$VER" | cut -d. -f2)
      if [ "$MAJOR" -eq 3 ] && [ "$MINOR" -ge 10 ] && [ "$MINOR" -le 13 ]; then
        PYTHON_BIN="$cmd"
        echo "✅ Found compatible Python ${VER} (${cmd})"
        break
      fi
    fi
  done
fi

if [ -z "$PYTHON_BIN" ]; then
  # Check system python3 / python
  for cmd in python3 python; do
    if command -v "$cmd" >/dev/null 2>&1; then
      VER=$("$cmd" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || true)
      MAJOR=$(echo "$VER" | cut -d. -f1)
      MINOR=$(echo "$VER" | cut -d. -f2)
      if [ "$MAJOR" -eq 3 ] && [ "$MINOR" -ge 10 ] && [ "$MINOR" -le 13 ]; then
        PYTHON_BIN="$cmd"
        echo "✅ Found compatible Python ${VER} (${cmd})"
        break
      fi
    fi
  done
fi

if [ -z "$PYTHON_BIN" ]; then
  SYS_PY=$(command -v python3 || command -v python || true)
  if [ -n "$SYS_PY" ]; then
    SYS_VER=$("$SYS_PY" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || true)
    echo "❌ Incompatible Python Version: Found Python ${SYS_VER} (${SYS_PY})."
    echo "   Python 3.14 is currently pre-release/experimental and is NOT yet supported by"
    echo "   compiled C/Rust packages (pydantic-core, greenlet, PyO3)."
    echo ""
    echo "👉 On Ubuntu 26.04 ('resolute'), install Python 3.12 in 5 seconds via 'uv' (no sudo needed):"
    echo "   curl -LsSf https://astral.sh/uv/install.sh | sh"
    echo "   source \$HOME/.local/bin/env"
    echo "   uv python install 3.12"
    echo ""
    echo "Then rerun: ./run_backend.sh"
    exit 1
  fi
  echo "❌ Error: Python 3.10 - 3.13 not found. Please install Python 3.12."
  exit 1
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

# Check if existing venv was created with an incompatible Python version (>= 3.14)
if [ -d "venv" ]; then
  VENV_VER=$(./venv/bin/python -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || true)
  VENV_MINOR=$(echo "$VENV_VER" | cut -d. -f2)
  if [ -n "$VENV_MINOR" ] && [ "$VENV_MINOR" -ge 14 ]; then
    echo "⚠️  Existing venv was created with incompatible Python ${VENV_VER}."
    echo "   Cleaning up and rebuilding venv with ${PYTHON_BIN}..."
    rm -rf venv
  fi
fi

if [ ! -d "venv" ]; then
  echo "📦 Creating virtual environment in ${BACKEND_DIR}/venv using ${PYTHON_BIN}..."
  if command -v uv >/dev/null 2>&1; then
    uv venv venv --python "${PYTHON_BIN}"
  else
    "$PYTHON_BIN" -m venv venv
  fi
fi

# Activate venv
# shellcheck disable=SC1091
source venv/bin/activate

# 4. Install / Verify Dependencies
if [ ! -f "venv/.installed" ] || [ requirements.txt -nt "venv/.installed" ]; then
  echo "📥 Installing / Updating backend dependencies from requirements.txt..."
  if command -v uv >/dev/null 2>&1; then
    uv pip install -r requirements.txt
  else
    pip install --upgrade pip
    pip install -r requirements.txt
  fi
  touch venv/.installed
  echo "✅ Dependencies installed successfully."
fi

# 5. Environment Defaults for AWS Deployment
export HOST="${HOST:-0.0.0.0}"

# DEBUG Mode & Port Selection:
# When DEBUG is true (1/true/yes): run on port 8000 in debug mode.
# When DEBUG is false (default): run on port 8080 (avoids collision with vLLM on port 8000).
DEBUG_LOWER=$(echo "${DEBUG:-false}" | tr '[:upper:]' '[:lower:]')
if [ "$DEBUG_LOWER" = "true" ] || [ "$DEBUG_LOWER" = "1" ] || [ "$DEBUG_LOWER" = "yes" ]; then
  export DEBUG="True"
  export PORT="${PORT:-8000}"
  DEBUG_LABEL="ENABLED (Port 8000)"
else
  export DEBUG="False"
  export PORT="${PORT:-8080}"
  DEBUG_LABEL="DISABLED (Port 8080)"
fi

export CORS_ORIGINS="${CORS_ORIGINS:-[\"*\"]}"

echo "🌐 Backend Configuration:"
echo "   • Host: ${HOST}"
echo "   • Port: ${PORT}"
echo "   • Debug Mode: ${DEBUG_LABEL}"
echo "   • CORS: ${CORS_ORIGINS}"
echo "   • Swagger Docs: http://${HOST}:${PORT}/docs"
echo "============================================================"
echo "🚀 Launching FastAPI application on ${HOST}:${PORT}..."
echo "============================================================"

# Run uvicorn server
exec python run.py
