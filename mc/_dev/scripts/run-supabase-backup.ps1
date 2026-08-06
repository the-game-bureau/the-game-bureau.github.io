$ErrorActionPreference = 'Stop'

# mc/_dev/scripts/ is three levels below the repo root; it was two until the 2026-08-06 move of _dev/ under mc/.
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$logDir = Join-Path $repoRoot 'mc\backups\logs'
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
