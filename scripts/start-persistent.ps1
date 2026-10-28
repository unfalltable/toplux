
$ErrorActionPreference='Stop'
$projectPath=Split-Path -Parent $PSScriptRoot
$taskName='CloseAI-Paihang-LocalDev-54ff658e'
$nodePath=(Get-Command node.exe).Source
$existing=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
  if ($existing.Actions.WorkingDirectory -ne $projectPath) { throw 'Existing task belongs to another directory' }
} else {
  $action=New-ScheduledTaskAction -Execute $nodePath -Argument '--import tsx apps/api/src/main.ts' -WorkingDirectory $projectPath
  $account=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $principal=New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
  $settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings -Description 'Local development API for project paihang; manually started, no elevated privileges.' | Out-Null
}
Start-ScheduledTask -TaskName $taskName
for($i=0;$i -lt 30;$i++){
  Start-Sleep -Milliseconds 500
  try {$health=Invoke-RestMethod -Uri 'http://127.0.0.1:3100/api/v1/health' -TimeoutSec 2;if($health.ok){Write-Output 'Persistent API ready: http://127.0.0.1:3100';exit 0}}catch{}
}
throw 'API failed to start'
