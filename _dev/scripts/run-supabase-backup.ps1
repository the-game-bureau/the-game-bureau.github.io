$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$logDir = Join-Path $repoRoot 'backups\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$logFile = Join-Path $logDir "supabase-backup-$stamp.log"

Push-Location $repoRoot
try {
  "[$(Get-Date -Format o)] Starting Supabase backup in $repoRoot" | Tee-Object -FilePath $logFile
  node "_dev\scripts\backup-supabase.js" 2>&1 | Tee-Object -FilePath $logFile -Append
  if ($LASTEXITCODE -ne 0) {
    throw "Supabase backup failed with exit code $LASTEXITCODE"
  }
  "[$(Get-Date -Format o)] Supabase backup finished" | Tee-Object -FilePath $logFile -Append
}
finally {
  Pop-Location
}
