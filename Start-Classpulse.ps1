$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$runtimeRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$bundledNode = Join-Path $runtimeRoot 'node\bin'
$bundledPnpm = Join-Path $runtimeRoot 'bin\fallback\pnpm.cmd'
if (-not (Get-Command node -ErrorAction SilentlyContinue) -and (Test-Path -LiteralPath (Join-Path $bundledNode 'node.exe'))) {
    $env:PATH = $bundledNode + ';' + $env:PATH
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host 'Node.js is required. Install Node.js and pnpm, then reopen this launcher.'
    Read-Host 'Press Enter to close'
    exit 1
}
$pnpmCommand = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
$manager = if ($pnpmCommand) { $pnpmCommand.Source } elseif (Test-Path -LiteralPath $bundledPnpm) { $bundledPnpm } elseif ($npmCommand) { $npmCommand.Source } else { $null }
if (-not $manager) {
    Write-Host 'A package manager is required. Install pnpm and reopen this launcher.'
    Read-Host 'Press Enter to close'
    exit 1
}
if (-not (Test-Path -LiteralPath 'node_modules\expo')) {
    & $manager install
    if ($LASTEXITCODE -ne 0) { Read-Host 'Setup failed. Press Enter to close'; exit 1 }
}
Write-Host 'Classpulse will open at http://localhost:8081. Keep this window open while testing.'
& $manager run web
if ($LASTEXITCODE -ne 0) { Read-Host 'Classpulse stopped. Press Enter to close' }
