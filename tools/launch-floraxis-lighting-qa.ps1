[CmdletBinding()]
param(
    [switch]$CheckOnly,
    [switch]$NoBrowser,
    [ValidateSet('auto', 'webgl')]
    [string]$Backend = 'auto'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$port = 8432
$baseUrl = "http://127.0.0.1:$port"
$backendQuery = if ($Backend -eq 'webgl') { '?backend=webgl' } else { '' }
$url = "$baseUrl/lighting-test.html$backendQuery"

function Stop-WithMessage {
    param([string]$Message)

    Write-Host ''
    Write-Host "[ERROR] $Message" -ForegroundColor Red
    exit 1
}

function Test-LightingQAServer {
    param([string]$TargetUrl)

    try {
        $response = Invoke-WebRequest -Uri $TargetUrl -UseBasicParsing -TimeoutSec 1
        return (
            $response.StatusCode -eq 200 -and
            $response.Content -match '<title>Floraxis Lighting QA Lab</title>'
        )
    }
    catch {
        return $false
    }
}

function Test-SupportedNodeVersion {
    param([string]$Version)

    if ($Version -notmatch '^v(\d+)\.(\d+)\.(\d+)') {
        return $false
    }

    $major = [int]$Matches[1]
    $minor = [int]$Matches[2]
    return (
        ($major -eq 20 -and $minor -ge 19) -or
        ($major -eq 22 -and $minor -ge 12) -or
        ($major -ge 24 -and $major % 2 -eq 0)
    )
}

Set-Location -LiteralPath $projectRoot

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'lighting-test.html'))) {
    Stop-WithMessage 'lighting-test.html is missing. Keep the launcher inside the Floraxis project folder.'
}

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'package.json'))) {
    Stop-WithMessage 'package.json is missing. Keep the launcher inside the Floraxis project folder.'
}

$node = Get-Command node.exe -ErrorAction SilentlyContinue
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue

if (-not $node -or -not $npm) {
    Stop-WithMessage 'Node.js was not found. Install Node.js 20.19+, 22.12+, or 24+, then try again.'
}

$nodeVersion = (& $node.Source --version).Trim()
if (-not (Test-SupportedNodeVersion -Version $nodeVersion)) {
    Stop-WithMessage "Unsupported Node.js version $nodeVersion. Install an even-numbered supported release (20.19+, 22.12+, or 24+)."
}

Write-Host ''
Write-Host 'Floraxis Lighting QA' -ForegroundColor Green
Write-Host "Node.js $nodeVersion is ready."
Write-Host "Target: $url"

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\vite\package.json'))) {
    Write-Host 'First-run setup: installing required packages...'
    & $npm.Source install
    if ($LASTEXITCODE -ne 0) {
        Stop-WithMessage 'Package installation failed.'
    }
}

$runningFloraxis = Test-LightingQAServer -TargetUrl $url
$portListener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue

if ($CheckOnly) {
    if ($portListener -and -not $runningFloraxis) {
        Stop-WithMessage "Port $port is in use by another program. The launcher will not stop or replace it."
    }
    $portState = if ($runningFloraxis) { 'Floraxis is already running' } else { "Port $port is available" }
    Write-Host "$portState. The double-click launcher is ready." -ForegroundColor Green
    exit 0
}

if ($runningFloraxis) {
    Write-Host 'Floraxis Lighting QA is already running. Opening it now.'
    if (-not $NoBrowser) {
        Start-Process $url
    }
    exit 0
}

if ($portListener) {
    Stop-WithMessage "Port $port is in use by another program. Close that program or change the launcher port."
}

$browserJob = $null
if (-not $NoBrowser) {
    $browserJob = Start-Job -ScriptBlock {
        param([string]$TargetUrl)

        for ($attempt = 0; $attempt -lt 120; $attempt += 1) {
            try {
                $response = Invoke-WebRequest -Uri $TargetUrl -UseBasicParsing -TimeoutSec 1
                if (
                    $response.StatusCode -eq 200 -and
                    $response.Content -match '<title>Floraxis Lighting QA Lab</title>'
                ) {
                    Start-Process $TargetUrl
                    return
                }
            }
            catch {
            }
            Start-Sleep -Milliseconds 250
        }
    } -ArgumentList $url
}

Write-Host ''
Write-Host 'Starting Floraxis Lighting QA...' -ForegroundColor Green
if (-not $NoBrowser) {
    Write-Host 'Your default browser will open automatically.'
}
Write-Host 'To stop the app, press Ctrl+C here or close this window.'
Write-Host ''

$serverExitCode = 0
try {
    & $npm.Source run dev -- --host 127.0.0.1 --port $port --strictPort
    $serverExitCode = $LASTEXITCODE
}
finally {
    if ($browserJob) {
        Stop-Job -Job $browserJob -ErrorAction SilentlyContinue
        Remove-Job -Job $browserJob -Force -ErrorAction SilentlyContinue
    }
}

if ($serverExitCode -ne 0) {
    Stop-WithMessage "The development server stopped with exit code $serverExitCode."
}
