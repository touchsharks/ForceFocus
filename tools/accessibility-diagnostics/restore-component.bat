@echo off
cd /d "%~dp0"
set "FF_ADB=%~dp0adb.exe"
if not exist "%FF_ADB%" set "FF_ADB=%~dp0..\adb.exe"
"%FF_ADB%" shell pm enable com.forcefocus.app/com.forcefocus.app.ForceFocusAccessibilityService
pause
