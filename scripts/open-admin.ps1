param([ValidateSet('admin','editor','reviewer')][string]$Account='admin')
$ErrorActionPreference='Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try { & node.exe --import tsx scripts/open-admin.ts $Account; if ($LASTEXITCODE -ne 0) { throw 'Failed to open local administration' } } finally { Pop-Location }
