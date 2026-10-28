import {existsSync} from 'node:fs';
import {spawnSync,spawn} from 'node:child_process';
import {mintStaffTicket} from '../apps/api/src/staff-access.js';
const account=process.argv[2]||'admin';
// The one-time credential is delivered directly to Chrome and never printed.
const result=spawnSync('powershell.exe',['-NoProfile','-Command',"(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe' -ErrorAction SilentlyContinue).'(default)'"],{encoding:'utf8',windowsHide:true});
const chrome=result.stdout.trim()||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
if(!existsSync(chrome))throw new Error('Google Chrome 未安装到可识别的位置');
const ticket=mintStaffTicket(account);
const child=spawn(chrome,['http://127.0.0.1:3100/admin/enter?ticket='+encodeURIComponent(ticket)],{detached:true,stdio:'ignore'});child.on('error',()=>{console.error('Chrome无法启动，请确认已安装Google Chrome。');});child.unref();
console.log('Chrome 已打开本机平台后台入口（60秒内有效）。');
