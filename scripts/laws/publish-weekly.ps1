# Weekly law publish, run by the Windows scheduled task "Grifo - publicar leis".
# Runs `npm run laws:publish` from the repo root and appends the output to .cache/laws-publish.log.
# Exits non-zero on failure so the task retries (up to 3 times, an hour apart).
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false) # npm and node print UTF-8
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repo
$log = Join-Path $repo ".cache\laws-publish.log"
New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null
"==== $(Get-Date -Format 'yyyy-MM-dd HH:mm') ====" | Add-Content -Encoding utf8 $log
npm run laws:publish *>&1 | Add-Content -Encoding utf8 $log
$code = $LASTEXITCODE
"exit $code" | Add-Content -Encoding utf8 $log
exit $code
