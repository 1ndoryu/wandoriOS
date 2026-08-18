#!/bin/bash
# Sentinel Extended Checks — Reglas P0/P1 implementadas como scripts standalone
# [Plan mejora quality tool] Reglas que el CLI v0.4.0 aún no soporta
# Compatible con Windows Git Bash (sin -P, sin lookaheads)

echo "=== Sentinel Extended: P0/P1 Architecture Checks ==="
echo ""

FRONTEND_SRC="${1:-frontend/src}"
EXIT_CODE=0

# === P0: archivo-max-lineas (300 líneas) ===
echo "--- P0: Archivos >300 líneas ---"
OVERSIZED=$(find "$FRONTEND_SRC" -name '*.ts' ! -name '*.d.ts' ! -name '*.test.ts' \
  ! -path '*/node_modules/*' ! -path '*/api/generated/*' \
  -exec wc -l {} + 2>/dev/null | sort -rn | awk '$1 > 300 && !/total/ {print}')

if [ -n "$OVERSIZED" ]; then
  echo "$OVERSIZED"
  echo ""
  echo "⚠️  Archivos exceden límite de 300 líneas. Dividir por responsabilidad."
  EXIT_CODE=1
else
  echo "✅ Todos los archivos están bajo 300 líneas"
fi
echo ""

# === P1: any-type-prohibido ===
echo "--- P1: Uso de 'any' prohibido ---"
ANY_USAGE=$(grep -rn 'as any\b\|@ts-ignore\|@ts-expect-error\|: any\b' "$FRONTEND_SRC" \
  --include="*.ts" --exclude="*.test.ts" --exclude="*.d.ts" \
  | grep -v 'node_modules' | grep -v 'Promise\.any\|Array\.any\|\.any(' \
  | head -20)

if [ -n "$ANY_USAGE" ]; then
  echo "$ANY_USAGE"
  echo ""
  echo "⚠️  Uso de 'any' detectado. Tipar correctamente."
  EXIT_CODE=1
else
  echo "✅ Sin uso de 'any' ni @ts-ignore"
fi
echo ""

# === P1: export-default-prohibido ===
echo "--- P1: Default exports prohibidos ---"
DEFAULT_EXPORTS=$(grep -rn '^export default ' "$FRONTEND_SRC" \
  --include="*.ts" --exclude="*.test.ts" --exclude="*.d.ts" \
  | grep -v 'node_modules' | head -10)

if [ -n "$DEFAULT_EXPORTS" ]; then
  echo "$DEFAULT_EXPORTS"
  echo ""
  echo "⚠️  Default exports detectados. Usar named exports."
  EXIT_CODE=1
else
  echo "✅ Sin default exports"
fi
echo ""

# === P1: console-log-produccion ===
echo "--- P1: Console en producción ---"
CONSOLE_USAGE=$(grep -rn 'console\.\(log\|error\|warn\|debug\)(' "$FRONTEND_SRC" \
  --include="*.ts" --exclude="*.test.ts" --exclude="*.d.ts" \
  | grep -v 'node_modules' | grep -v 'scripts/' | grep -v '\.mjs' \
  | grep -v 'vite\.config' | grep -v 'safe-async\.ts' \
  | grep -v 'command-registry\.ts' \
  | head -15)

if [ -n "$CONSOLE_USAGE" ]; then
  echo "$CONSOLE_USAGE"
  echo ""
  echo "⚠️  Console en código de producción. Usar showToast o servicio de logging."
else
  echo "✅ Sin console en producción"
fi
echo ""

# === P1: subscribe-sin-cleanup ===
echo "--- P1: Subscribe sin cleanup ---"
# Buscar .subscribe( que NO esté precedido por asignación (const x = ... o let x = ...)
# Excluir shell-level (viven toda la sesión) y stores globales
SUBSCRIBE_NO_CLEANUP=$(grep -rn '\.subscribe(' "$FRONTEND_SRC" \
  --include="*.ts" --exclude="*.test.ts" --exclude="*.d.ts" \
  | grep -v 'node_modules' \
  | grep -v 'stores\.ts\|store\.ts\|main\.ts\|desktop-shell\.ts\|reactive-taskbar\.ts\|workspace-icon-grid\.ts' \
  | grep -v 'const \|let \|const unsubscribe\|this\.\w\+ =' \
  | head -15)

if [ -n "$SUBSCRIBE_NO_CLEANUP" ]; then
  echo "$SUBSCRIBE_NO_CLEANUP"
  echo ""
  echo "ℹ️  Subscribe sin cleanup en componentes. Shell-level (desktop-shell, reactive-taskbar, workspace-icon-grid) ya excluidos — viven toda la sesión."
else
  echo "✅ Todos los subscribes tienen cleanup asignado"
fi
echo ""

# === P1: api-call-en-logica ===
echo "--- P1: API calls fuera de services ---"
# Excluir comentarios JSDoc y líneas de ejemplo
API_CALLS=$(grep -rn 'api\.\(get\|post\|put\|delete\)(' "$FRONTEND_SRC" \
  --include="*.ts" --exclude="*.test.ts" --exclude="*.d.ts" \
  | grep -v 'node_modules' \
  | grep -v 'api/client\.ts\|services/' \
  | grep -v '^\s*[*]' \
  | grep -v '\/\/' \
  | grep -v 'safe-async\.ts' \
  | head -15)

if [ -n "$API_CALLS" ]; then
  echo "$API_CALLS"
  echo ""
  echo "⚠️  API calls directas fuera de services. Usar service layer."
  EXIT_CODE=1
else
  echo "✅ API calls correctamente delegadas a services"
fi
echo ""

# === P1: import-store-directo ===
echo "--- P1: Imports directos de stores desde lógica ---"
STORE_IMPORTS=$(grep -rn "import.*from.*['\"].*stores\?\.ts['\"]" "$FRONTEND_SRC" \
  --include="*.ts" --exclude="*.test.ts" --exclude="*.d.ts" \
  | grep -v 'node_modules' \
  | grep -v 'stores\.ts\|store\.ts\|index\.ts\|workspace-store\.ts' \
  | head -15)

if [ -n "$STORE_IMPORTS" ]; then
  echo "$STORE_IMPORTS"
  echo ""
  echo "⚠️  Imports directos de stores desde módulos de lógica."
else
  echo "✅ Stores correctamente encapsulados"
fi
echo ""

# === INFO: store-mutation-in-view ===
echo "--- INFO: Store mutations en vistas ---"
# En vanilla TS sin framework, showProfile/authStore.set() en pages es el patrón esperado.
# No hay lifecycle de componente para delegar. Registrar como INFO, no error.
STORE_MUTATIONS=$(grep -rn '\w\+Store\.\(set\|update\)(' "$FRONTEND_SRC/pages/" \
  --include="*.ts" --exclude="*.test.ts" 2>/dev/null \
  | grep -v 'node_modules' | head -10)

STORE_MUTATIONS2=$(grep -rn '\w\+\.\(set\|update\)(' "$FRONTEND_SRC/pages/" \
  --include="*.ts" --exclude="*.test.ts" 2>/dev/null \
  | grep -v 'node_modules' | grep -E '(showProfile|authStore|fontStore|siteConfig|showSidebar)\.' \
  | head -10)

if [ -n "$STORE_MUTATIONS" ] || [ -n "$STORE_MUTATIONS2" ]; then
  echo "${STORE_MUTATIONS}${STORE_MUTATIONS2}"
  echo ""
  echo "ℹ️  Store mutations en vistas (vanilla TS — patrón legítimo sin framework)."
else
  echo "✅ Sin store mutations directas en vistas"
fi
echo ""

# === P2: interface-grande (>10 campos) ===
echo "--- P2: Interfaces grandes (>10 campos) ---"
# Contar campos reales (líneas con nombre: tipo;) ignorando tipos anidados Array<{...}>.
# Cuenta líneas que empiezan con espacios + identificador + opcional ? + :
LARGE_INTERFACES=$(find "$FRONTEND_SRC" -name '*.ts' ! -name '*.d.ts' ! -name '*.test.ts' \
  ! -path '*/node_modules/*' 2>/dev/null \
  | while IFS= read -r file; do
      awk '
        /^export interface |^interface / {
          name=$0; count=0; in_iface=1; brace_depth=0
          # Contar campos en la misma línea (interface de una sola línea)
          n = split($0, parts, "")
          for (i = 1; i <= n; i++) {
            if (parts[i] == "{") brace_depth++
            if (parts[i] == "}") brace_depth--
          }
          # Contar campos como líneas con "  campo?:" o "  campo:"
          line = $0
          gsub(/[^:]+/, "", line)
          field_count = length(line)
          # Restar 1 por el { de apertura
          if (field_count > 0) count = field_count - 1
          if (brace_depth <= 0) {
            if (count > 10) print FILENAME":"NR": "name" ("count" campos)"
            in_iface=0
          }
          next
        }
        in_iface && /^[[:space:]]+[A-Za-z_][A-Za-z0-9_]*\??:/ {
          count++
        }
        in_iface && /^[[:space:]]*\[/ {
          # Index signature como [key: string]: ... — contar como 1 campo
          count++
        }
        in_iface && /^}/ {
          if (count > 10) print FILENAME":"NR": "name" ("count" campos)"
          in_iface=0
        }
      ' "$file" 2>/dev/null
    done)

if [ -n "$LARGE_INTERFACES" ]; then
  echo "$LARGE_INTERFACES"
  echo ""
  echo "ℹ️  Interfaces con >10 campos. Considerar dividir en sub-interfaces (ISP)."
else
  echo "✅ Todas las interfaces tienen ≤10 campos"
fi
echo ""

# === P2: catch-silencioso (catch con solo comentarios) ===
echo "--- P2: Catch silencioso ---"
# Buscar catch { /* ... */ } o catch { // ... } sin código real
SILENT_CATCH=$(grep -rn 'catch\s*{' "$FRONTEND_SRC" \
  --include="*.ts" --exclude="*.test.ts" --exclude="*.d.ts" \
  | grep -v 'node_modules' \
  | while IFS= read -r line; do
      file=$(echo "$line" | cut -d: -f1)
      lineno=$(echo "$line" | cut -d: -f2)
      # Leer la siguiente línea para ver si es solo comentario
      nextline=$(sed -n "$((lineno+1))p" "$file" 2>/dev/null)
      if echo "$nextline" | grep -qE '^\s*(\/\/|\/\*|\*).*'; then
        nextline2=$(sed -n "$((lineno+2))p" "$file" 2>/dev/null)
        if echo "$nextline2" | grep -qE '^\s*\}'; then
          echo "$file:$lineno: catch con solo comentario"
        fi
      fi
    done | head -10)

if [ -n "$SILENT_CATCH" ]; then
  echo "$SILENT_CATCH"
  echo ""
  echo "⚠️  Catch silencioso — registrar, notificar o propagar el error."
else
  echo "✅ Sin catch silenciosos"
fi
echo ""

# === P2: modulo-rexport-mutations (re-exports + lógica) ===
echo "--- P2: Módulos con re-exports + lógica ---"
# Buscar archivos que mezclan 'export { X } from' con 'export function/const'
MIXED_EXPORTS=$(find "$FRONTEND_SRC" -name '*.ts' ! -name '*.d.ts' ! -name '*.test.ts' \
  ! -path '*/node_modules/*' ! -path '*/index.ts' 2>/dev/null \
  | while IFS= read -r file; do
      has_reexport=$(grep -c 'export {.*} from' "$file" 2>/dev/null)
      has_logic=$(grep -cE '^export (function|const|class|async)' "$file" 2>/dev/null)
      if [ "$has_reexport" -gt 0 ] && [ "$has_logic" -gt 0 ]; then
        echo "$file: $has_reexport re-exports + $has_logic definiciones (SRP: separar)"
      fi
    done | head -10)

if [ -n "$MIXED_EXPORTS" ]; then
  echo "$MIXED_EXPORTS"
  echo ""
  echo "ℹ️  Módulos mezclan re-exports con lógica. Considerar separar barrel de lógica."
else
  echo "✅ Sin módulos mixtos (re-exports + lógica)"
fi
echo ""

# === P2: export-no-usado (exports no importados) ===
echo "--- P2: Exports no importados ---"
# Para cada export, verificar si algún otro archivo lo importa
UNUSED_EXPORTS=$(grep -rn '^export \(function\|const\|class\) \w\+' "$FRONTEND_SRC" \
  --include="*.ts" --exclude="*.test.ts" --exclude="*.d.ts" \
  | grep -v 'node_modules' | grep -v 'index\.ts' \
  | while IFS= read -r line; do
      name=$(echo "$line" | sed 's/.*export \(function\|const\|class\) \([A-Za-z_]\w*\).*/\2/' 2>/dev/null)
      file=$(echo "$line" | cut -d: -f1)
      # Buscar si algún archivo importa este nombre
      count=$(grep -rl "\b$name\b" "$FRONTEND_SRC" --include="*.ts" --exclude="*.test.ts" 2>/dev/null \
        | grep -v "$file" | grep -v 'node_modules' | wc -l)
      if [ "$count" -eq 0 ]; then
        echo "$file: export '$name' no importado por ningún módulo"
      fi
    done | head -10)

if [ -n "$UNUSED_EXPORTS" ]; then
  echo "$UNUSED_EXPORTS"
  echo ""
  echo "⚠️  Exports no importados — posible código muerto."
else
  echo "✅ Todos los exports tienen al menos un importador"
fi
echo ""

if [ $EXIT_CODE -eq 0 ]; then
  echo "✅ Todas las verificaciones P0/P1/P2 pasaron"
else
  echo "⚠️  Se encontraron violaciones. Revisar hallazgos arriba."
fi

exit $EXIT_CODE
