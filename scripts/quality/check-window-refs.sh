#!/bin/bash
# Sentinel P0 — Auditoría de referencias a window.*
# Detecta window.location, window.innerWidth/Height, window.addEventListener
# que acoplan el frontend al navegador.
# [Auditoría v4 §4.2] 21 referencias a window.*
# [Auditoría v4 §4.3] Eventos globales sin cleanup

echo "=== Sentinel P0: Window Reference Check ==="
echo ""

FRONTEND_SRC="${1:-frontend/src}"

echo "--- window.location (acoplamiento a navegación) ---"
WLOC=$(grep -rn "window\.\(location\|history\|scrollTo\)" "$FRONTEND_SRC" --include="*.ts" \
  --exclude="*.test.ts" --exclude="*.d.ts" \
  | grep -v "node_modules" \
  | head -15)

if [ -n "$WLOC" ]; then
  echo "$WLOC"
  echo ""
else
  echo "✅ No se encontraron referencias directas"
fi

echo "--- window.inner (viewport references) ---"
WVIEW=$(grep -rn "window\.\(innerWidth\|innerHeight\)" "$FRONTEND_SRC" --include="*.ts" \
  --exclude="*.test.ts" --exclude="*.d.ts" \
  | grep -v "node_modules" \
  | head -10)

if [ -n "$WVIEW" ]; then
  echo "$WVIEW"
  echo ""
  echo "⚠️  window.innerWidth/Height encontrado. Abstraer vía shell.getViewport()."
else
  echo "✅ No se encontraron referencias a window.inner"
fi

echo ""
echo "--- window.addEventListener (eventos sin cleanup potencial) ---"
WLISTEN=$(grep -rn "window\.addEventListener" "$FRONTEND_SRC" --include="*.ts" \
  --exclude="*.test.ts" --exclude="*.d.ts" \
  | grep -v "node_modules" \
  | head -10)

if [ -n "$WLISTEN" ]; then
  echo "$WLISTEN"
  echo ""
  echo "⚠️  Verificar que estos listeners tengan removeEventListener correspondiente."
else
  echo "✅ No se encontraron window.addEventListener"
fi
