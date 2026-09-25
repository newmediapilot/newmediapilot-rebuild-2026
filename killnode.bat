@echo off
setlocal
echo Killing node processes (excluding opencode)...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ps = @(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -notmatch 'opencode' }); foreach ($p in $ps) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; Write-Host ('  killed PID ' + $p.ProcessId) } catch { Write-Host ('  FAILED PID ' + $p.ProcessId) } }; Write-Host ('Done. ' + $ps.Count + ' process(es) killed.')"

endlocal
