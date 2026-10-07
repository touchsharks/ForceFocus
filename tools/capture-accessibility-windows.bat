@echo off
setlocal
cd /d "%~dp0"
set "FF_ADB=%~dp0adb.exe"
if not exist "%FF_ADB%" (
  echo Put this BAT file beside adb.exe in your platform-tools folder.
  pause
  exit /b 1
)
"%FF_ADB%" get-state
if errorlevel 1 (
  echo Connect the phone and allow USB debugging, then retry.
  pause
  exit /b 1
)
set "FF_LOG_DIR=%~dp0ForceFocus-a11y-logs-%RANDOM%-%RANDOM%"
mkdir "%FF_LOG_DIR%"
echo Keep ForceFocus OUT of focus mode. Disable the accessibility floating shortcut.
echo This capture only reads state. It does not enable, disable, or clear anything.
powershell -NoProfile -Command "$p=Start-Process -FilePath $env:FF_ADB -ArgumentList @('logcat','-v','threadtime') -RedirectStandardOutput ($env:FF_LOG_DIR+'\live-system-log.txt') -RedirectStandardError ($env:FF_LOG_DIR+'\logcat-errors.txt') -PassThru -NoNewWindow; try { & $env:FF_ADB shell dumpsys accessibility | Out-File -Encoding utf8 ($env:FF_LOG_DIR+'\before-accessibility.txt'); & $env:FF_ADB shell settings get secure enabled_accessibility_services | Out-File -Encoding utf8 ($env:FF_LOG_DIR+'\before-enabled-services.txt'); Write-Host 'ON PHONE: turn ForceFocus accessibility OFF then ON, accept, go BACK, wait 10 seconds.'; [void](Read-Host 'Then press ENTER here to finish capture') } finally { if (-not $p.HasExited) { Stop-Process -Id $p.Id } }"
"%FF_ADB%" shell dumpsys accessibility > "%FF_LOG_DIR%\after-accessibility.txt"
"%FF_ADB%" shell settings get secure enabled_accessibility_services > "%FF_LOG_DIR%\after-enabled-services.txt"
"%FF_ADB%" shell dumpsys package com.forcefocus.app > "%FF_LOG_DIR%\package-state.txt"
"%FF_ADB%" shell dumpsys activity exit-info com.forcefocus.app > "%FF_LOG_DIR%\process-exit-info.txt" 2>&1
"%FF_ADB%" shell getprop ro.product.model > "%FF_LOG_DIR%\device-model.txt"
"%FF_ADB%" shell getprop ro.build.display.id > "%FF_LOG_DIR%\system-build.txt"
"%FF_ADB%" shell getprop ro.build.version.release > "%FF_LOG_DIR%\android-version.txt"
powershell -NoProfile -Command "Compress-Archive -Path ($env:FF_LOG_DIR+'\*') -DestinationPath ($env:FF_LOG_DIR+'.zip'); Write-Host ('Upload: '+$env:FF_LOG_DIR+'.zip')"
echo Capture finished. Upload the new ForceFocus-a11y-logs ZIP file.
pause
