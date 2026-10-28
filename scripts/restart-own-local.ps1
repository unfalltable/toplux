$ErrorActionPreference='Stop'
$taskName='CloseAI-Paihang-LocalDev-54ff658e'
$projectPath=Split-Path -Parent $PSScriptRoot
$task=Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
if($task.Actions.WorkingDirectory -ne $projectPath){throw 'Task belongs to another directory'}
Stop-ScheduledTask -TaskName $taskName
for($i=0;$i -lt 20;$i++){try{$null=Invoke-RestMethod -Uri 'http://127.0.0.1:3100/api/v1/health' -TimeoutSec 1;Start-Sleep -Milliseconds 250}catch{break}}
Start-ScheduledTask -TaskName $taskName
for($i=0;$i -lt 60;$i++){
 Start-Sleep -Milliseconds 500
 try{$c=Invoke-RestMethod -Uri 'http://127.0.0.1:3100/api/v1/categories' -TimeoutSec 2;$w=$c.items|Where-Object slug -eq 'watches';$p=Invoke-RestMethod -Uri ('http://127.0.0.1:3100/api/v1/categories/'+$w.id+'/brands') -TimeoutSec 2
 if($p.items[0].media.logo.src -match '-v2.png$'){Write-Output ('Ready: '+$p.items.Count+' watch profiles; reviewed official media loaded');exit 0}
 }catch{}
}
throw 'Updated local API not ready'
