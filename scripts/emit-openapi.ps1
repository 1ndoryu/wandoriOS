<#
[304A-2] Wrapper único para exportar OpenAPI sin seguir inflando targets huérfanos.

Por qué existe:
- `cargo run --target-dir C:\tmp\glory-openapi-target -- --emit-openapi ...` evita
  locks del target principal en Windows.
- Si se usa ese target separado a mano, termina creciendo sin entrar en la rutina
  de limpieza normal del proyecto.

Este script centraliza el flujo:
1. limpia el target OpenAPI si ya está pasado del tope,
2. exporta `openapi.json` usando el target separado,
3. vuelve a podar caches regenerables al cerrar.
#>

param(
    [string]$OpenApiPath = 'openapi.json',
    [string]$TargetDir = 'C:\tmp\glory-openapi-target',
    [int]$MaxTotalMB = 4096,
    [switch]$SkipPreClean,
    [switch]$SkipPostClean
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$cleanScript = Join-Path $PSScriptRoot 'clean-cargo-target.ps1'

function Invoke-TargetCleanup {
    param([string]$Phase)

    if (-not (Test-Path -LiteralPath $cleanScript)) {
        Write-Warning "[$Phase] Se omite limpieza: no existe $cleanScript"
        return
    }

    & powershell -ExecutionPolicy Bypass -File $cleanScript -TargetDirs $TargetDir -MaxTotalMB $MaxTotalMB
    if ($LASTEXITCODE -ne 0) {
        throw "La limpieza $Phase de $TargetDir falló con exit code $LASTEXITCODE"
    }
}

if (-not $SkipPreClean) {
    Invoke-TargetCleanup -Phase 'previa'
}

Push-Location $repoRoot
try {
    & cargo run --target-dir $TargetDir -- --emit-openapi $OpenApiPath
    if ($LASTEXITCODE -ne 0) {
        throw "cargo run -- --emit-openapi falló con exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

if (-not $SkipPostClean) {
    Invoke-TargetCleanup -Phase 'posterior'
}
