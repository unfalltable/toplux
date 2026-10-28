
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$listener = Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue
if ($listener) { Write-Output 'Port 3100 already in use; inspect it before starting another API.'; exit 1 }
$commandLine = 'cmd.exe /c "node.exe --import tsx apps/api/src/main.ts 1>.api-out.log 2>.api-error.log"'
$result = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=$commandLine; CurrentDirectory=$projectPath}
if ($result.ReturnValue -ne 0) { throw ('Unable to start API: ' + $result.ReturnValue) }
Write-Output ('API supervisor PID ' + $result.ProcessId)
for ($i=0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 500
  try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3100/api/v1/health' -TimeoutSec 2; if ($health.ok) { Write-Output 'Ready: http://127.0.0.1:3100'; exit 0 } } catch {}
}
throw 'API did not become ready; inspect .api-error.log'
