#!/bin/bash
# Sentinel P0 — Auditoría de abstracción DOM
# Detecta archivos que usan document.createElement directamente
# en lugar del helper createEl().
# [Auditoría v4 §1.2] createElement sin abstracción

echo "=== Sentinel P0: DOM Abstraction Check ==="
echo ""

FRONTEND_SRC="${1:-frontend/src}"

# Buscar document.createElement en archivos .ts (excluyendo dom.ts, .test.ts y excepciones documentadas)
# Excepciones documentadas:
#   - sanitize-html.ts: createElement(tag) dinámico — el sanitizer DEBE crear elementos por nombre de tag
FILES=$(grep -rn "document\.createElement" "$FRONTEND_SRC" --include="*.ts" \
  --exclude="dom.ts" --exclude="*.test.ts" --exclude="*.d.ts" \
  | grep -v "node_modules" \
  | grep -v "sanitize-html.ts" \
  | head -30)

if [ -z "$FILES" ]; then
  echo "✅ No se encontraron document.createElement directos (excluyendo dom.ts)"
  exit 0
fi

COUNT=$(echo "$FILES" | wc -l)
echo "⚠️  Se encontraron $COUNT archivos con document.createElement directo:"
echo ""
echo "$FILES"
echo ""
echo "Acción: Migrar a createEl() o agregar excepción documentada."
exit 1
