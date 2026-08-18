param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d{2}[1-9ABC][A-Z]-\d+$')]
    [string]$TareaId
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$npmExecutable = if ($IsWindows -or $env:OS -eq 'Windows_NT') { 'npm.cmd' } else { 'npm' }

Push-Location $projectRoot
try {
    & $npmExecutable run task:check -- $TareaId
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
