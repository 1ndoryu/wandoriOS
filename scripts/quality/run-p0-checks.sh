#!/bin/bash
# Sentinel P0 — Quality Gate Runner
# Ejecuta todas las reglas P0 de Sentinel y reporta resultados.
# [Auditoría v4 §8] Reglas automatizables sin AST
#
# Uso:
#   ./scripts/quality/run-p0-checks.sh [frontend_src_path]
#
# Exit code:
#   0 = todos los checks pasan
#   1 = al menos un check falla

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_SRC="${1:-frontend/src}"
ALL_PASS=true

echo "╔══════════════════════════════════════════════╗"
echo "║  Sentinel P0 — Quality Gate Runner           ║"
echo "║  $(date '+%Y-%m-%d %H:%M:%S')                ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

run_check() {
  local name="$1"
  local script="$2"
  echo "──────────────────────────────────────────"
  echo "  [$name]"
  echo "──────────────────────────────────────────"
  if bash "$SCRIPT_DIR/$script" "$FRONTEND_SRC"; then
    echo "  ✅ $name: PASS"
  else
    echo "  ❌ $name: FAIL"
    ALL_PASS=false
  fi
  echo ""
}

run_check "DOM Abstraction" "check-dom-abstraction.sh"
run_check "Global State" "check-singleton-state.sh"
run_check "Window Refs" "check-window-refs.sh"

echo "╔══════════════════════════════════════════════╗"
if [ "$ALL_PASS" = true ]; then
  echo "║  ✅ Todos los checks P0: PASS               ║"
else
  echo "║  ❌ Algunos checks P0: FAIL                 ║"
fi
echo "╚══════════════════════════════════════════════╝"

[ "$ALL_PASS" = true ] && exit 0 || exit 1
