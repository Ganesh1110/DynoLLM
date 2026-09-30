#!/usr/bin/env bash
# ==============================================================================
# DynoLLM - Restart Background Services
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

./stop.sh
echo ""
sleep 1
./start.sh
