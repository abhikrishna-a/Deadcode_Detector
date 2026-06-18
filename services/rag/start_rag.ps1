$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location -LiteralPath $scriptDir

# Kill any existing RAG process on port 8004
$existing = Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
    Where-Object { $_.CommandLine -match 'port 8004' }
if ($existing) {
    Write-Host "Killing existing RAG process(es) on port 8004..." -ForegroundColor Yellow
    $existing | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    Start-Sleep -Seconds 1
}

Write-Host "Starting RAG FastAPI on port 8004..." -ForegroundColor Green

# Start uvicorn without --reload to avoid orphan child processes
try {
    uvicorn app.main:app --port 8004
}
finally {
    # On exit, kill any remaining orphan processes on port 8004
    $orphans = Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
        Where-Object { $_.CommandLine -match 'port 8004' }
    if ($orphans) {
        $orphans | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    }
}
