# Sentinel P0 — Quality Gate Runner (PowerShell)
# Ejecuta todas las reglas P0 de Sentinel y reporta resultados.
# [Auditoría v4 §8] Reglas automatizables sin AST
#
# Uso:
#   powershell -File scripts/quality/run-p0-checks.ps1
#
# Exit code:
#   0 = todos los checks pasan
#   1 = al menos un check falla

param(
    [string]$SrcPath = "frontend/src"
)

$ErrorActionPreference = "Continue"
$allPass = $true

Write-Host "╔══════════════════════════════════════════════╗"
Write-Host "║  Sentinel P0 — Quality Gate Runner (PS)     ║"
Write-Host "║  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  ║"
Write-Host "╚══════════════════════════════════════════════╝"
Write-Host ""

function Run-Check {
    param($Name, $Pattern, $Severity = "warning")
    
    Write-Host "──────────────────────────────────────────"
    Write-Host "  [$Name]"
    Write-Host "──────────────────────────────────────────"
    
    $files = Get-ChildItem -Path $SrcPath -Recurse -Filter "*.ts" `
        | Where-Object { $_.Name -notmatch '\.(test|d)\.ts$' -and $_.FullName -notmatch 'node_modules' }
    
    $results = Select-String -Pattern $Pattern -Path $files.FullName -SimpleMatch:$false
    
    if ($results.Count -eq 0) {
        Write-Host "  ✅ PASS"
        return $true
    }
    
    Write-Host "  ⚠️  $($results.Count) resultado(s) encontrado(s):"
    $results | ForEach-Object { Write-Host "    $($_.Path):$($_.LineNumber): $($_.Line.Trim())" }
    Write-Host "  ❌ FAIL"
    return $false
}

$check1 = Run-Check -Name "DOM Abstraction" -Pattern "document\.createElement"
if (-not $check1) { Write-Host "  ⚠️  Migrar a createEl()" }
$allPass = $allPass -and $check1

$check2 = Run-Check -Name "Module-level let" -Pattern "^let "
if (-not $check2) { Write-Host "  ⚠️  Mover a store" }
$allPass = $allPass -and $check2

$check3 = Run-Check -Name "window.location" -Pattern "window\.(location|history|scrollTo)"
$allPass = $allPass -and $check3

$check4 = Run-Check -Name "window.inner" -Pattern "window\.(innerWidth|innerHeight)"
$allPass = $allPass -and $check4

Write-Host "╔══════════════════════════════════════════════╗"
if ($allPass) {
    Write-Host "║  ✅ Todos los checks P0: PASS               ║"
} else {
    Write-Host "║  ❌ Algunos checks P0: FAIL                 ║"
}
Write-Host "╚══════════════════════════════════════════════╝"

exit $(if ($allPass) { 0 } else { 1 })
