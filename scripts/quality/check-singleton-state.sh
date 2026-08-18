#!/bin/bash
# Sentinel P0 — Auditoría de estado mutable global
# Detecta 'let' a nivel de módulo que indica estado mutable global.
# [Auditoría v4 §1.3/1.4] Estado mutable global
# [Auditoría v4 §5.3] Singletons con estado

echo "=== Sentinel P0: Global Mutable State Check ==="
echo ""

FRONTEND_SRC="${1:-frontend/src}"

# Buscar 'let' a nivel de módulo (sin indentación = scope global)
# Excluye archivos de test y type declarations
echo "--- Estado mutable global (let a nivel de módulo) ---"
LETS=$(grep -rn "^let " "$FRONTEND_SRC" --include="*.ts" \
  --exclude="*.test.ts" --exclude="*.d.ts" \
  | grep -v "node_modules" \
  | head -20)

if [ -n "$LETS" ]; then
  echo "$LETS"
  echo ""
  echo "⚠️  Estado mutable global encontrado. Considerar mover a store."
else
  echo "✅ No se encontró estado mutable global (let a nivel módulo)"
fi

echo ""

# Buscar 'let' con indentación que pueda ser módulo-level
# (dentro de closures de module pero no dentro de funciones)
echo "--- Let con indentación (posible módulo-level) ---"
LETS_INDENTED=$(grep -rn "^  let " "$FRONTEND_SRC" --include="*.ts" \
  --exclude="*.test.ts" --exclude="*.d.ts" \
  | grep -v "node_modules" \
  | head -10)

if [ -n "$LETS_INDENTED" ]; then
  echo "$LETS_INDENTED"
  echo ""
  echo "⚠️  Verificar manualmente — podrían ser estado global dentro de IIFE o module."
else
  echo "✅ No se encontró let con indentación significativo"
fi

echo ""

# Buscar singletons con estado (private static instance)
echo "--- Singletons con estado (private static instance) ---"
SINGLETONS=$(grep -rn "private static instance" "$FRONTEND_SRC" --include="*.ts" \
  | grep -v "node_modules" \
  | head -10)

if [ -n "$SINGLETONS" ]; then
  echo "$SINGLETONS"
  echo ""
  echo "⚠️  Singletons con estado encontrados. Evaluar scoping contextual."
else
  echo "✅ No se encontraron singletons con estado"
fi
