$ErrorActionPreference = 'Stop'
$adb = Join-Path $PSScriptRoot 'adb.exe'
if (-not (Test-Path $adb)) { $adb = Join-Path (Split-Path $PSScriptRoot -Parent) 'adb.exe' }
if (-not (Test-Path $adb)) { throw '请把这整个文件夹放到 platform-tools 里，再双击运行 start.bat。' }
$device = & $adb get-state 2>&1
if ($LASTEXITCODE -ne 0 -or "$device" -notmatch 'device') { throw '请连接手机，打开 USB 调试，并在手机上允许此电脑调试。' }
$out = Join-Path $PSScriptRoot ('ForceFocus-diagnostics-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $out | Out-Null
$keys = 'enabled_accessibility_services|accessibility_enabled|accessibility_button_targets|accessibility_shortcut_target_service|accessibility_qs_targets|accessibility_direct_access_target_service'
function Save-Adb($argsList, $filename) {
    & $adb @argsList 2>&1 | Out-File -Encoding utf8 (Join-Path $out $filename)
}
function Snapshot($label) {
    (Get-Date -Format o) + ' ' + $label | Add-Content -Encoding utf8 (Join-Path $out 'stages.txt')
    Save-Adb @('shell','dumpsys','accessibility') ($label + '-accessibility.txt')
    & $adb shell dumpsys settings 2>&1 | Select-String -Pattern $keys | ForEach-Object { $_.Line } | Out-File -Encoding utf8 (Join-Path $out ($label + '-settings-writers.txt'))
    Save-Adb @('shell','dumpsys','activity','exit-info','com.forcefocus.app') ($label + '-process-exits.txt')
    Save-Adb @('shell','dumpsys','activity','services','com.vivo.safecenter') ($label + '-safety-services.txt')
    Save-Adb @('shell','cmd','appops','get','com.forcefocus.app') ($label + '-appops.txt')
    Save-Adb @('shell','ps','-A') ($label + '-processes.txt')
}
$log = $null
$watcher = $null
try {
    Save-Adb @('shell','dumpsys','package','com.forcefocus.app') 'package-state.txt'
    Save-Adb @('shell','dumpsys','package','com.vivo.safecenter') 'safety-package-state.txt'
    Save-Adb @('shell','pm','list','packages','-i','com.forcefocus.app') 'install-source.txt'
    Save-Adb @('shell','dumpsys','-l') 'available-system-services.txt'
    Save-Adb @('shell','getprop','ro.product.model') 'device-model.txt'
    Save-Adb @('shell','getprop','ro.build.display.id') 'system-build.txt'
    Save-Adb @('shell','getprop','ro.build.version.release') 'android-version.txt'
    $log = Start-Process -FilePath $adb -ArgumentList @('logcat','-b','all','-v','threadtime') -RedirectStandardOutput (Join-Path $out 'system-log.txt') -RedirectStandardError (Join-Path $out 'logcat-errors.txt') -PassThru -NoNewWindow
    $watcher = Start-Job -ArgumentList $adb,$out,$keys -ScriptBlock {
        param($adbPath,$dir,$pattern)
        $last = $null
        $index = 0
        while ($true) {
            $now = Get-Date -Format o
            $value = (& $adbPath shell settings get secure enabled_accessibility_services 2>&1 | Out-String).Trim()
            $now + ' enabled_services=' + $value | Add-Content -Encoding utf8 (Join-Path $dir 'permission-timeline.txt')
            if ($value -ne $last) {
                $index++
                $now + ' permission-change-' + $index | Add-Content -Encoding utf8 (Join-Path $dir 'permission-changes.txt')
                & $adbPath shell dumpsys settings 2>&1 | Select-String -Pattern $pattern | ForEach-Object { $_.Line } | Out-File -Encoding utf8 (Join-Path $dir ('change-' + $index + '-settings-writers.txt'))
                & $adbPath shell dumpsys accessibility 2>&1 | Out-File -Encoding utf8 (Join-Path $dir ('change-' + $index + '-accessibility.txt'))
                $last = $value
            }
            Start-Sleep -Milliseconds 700
        }
    }
    Write-Host "`n只采集信息，不修改手机权限，不要求录屏。先保持未专注。" -ForegroundColor Cyan
    Snapshot '00-initial'
    Write-Host "`n第 1 步：关闭 ForceFocus 无障碍悬浮按钮。在系统无障碍页面开启服务、允许，返回上一层，等待约 10 秒。"
    [void](Read-Host '完成后在这里按回车')
    Snapshot '01-settings-route'
    Write-Host "`n第 2 步：开启你之前使用的无障碍悬浮按钮，按平常方式尝试开启服务。最多尝试 3 次，等待约 10 秒。"
    [void](Read-Host '无论成功还是失败，操作完后按回车')
    Snapshot '02-shortcut-route'
    Write-Host "`n第 3 步：仍保持未专注，打开微信，等待约 10 秒，再返回 ForceFocus。"
    [void](Read-Host '完成后按回车')
    Snapshot '03-wechat-without-focus'
    Write-Host "`n本轮仅排查权限开启，不进入专注，不修改任何手机管家开关。"
    Snapshot '05-final'
} finally {
    if ($watcher) { Stop-Job $watcher; Receive-Job $watcher 2>&1 | Out-File -Encoding utf8 (Join-Path $out 'watcher-status.txt'); Remove-Job $watcher }
    if ($log -and -not $log.HasExited) { Stop-Process -Id $log.Id }
    Compress-Archive -Path (Join-Path $out '*') -DestinationPath ($out + '.zip')
    Write-Host "`n请把这个文件上传给我：" -ForegroundColor Green
    Write-Host ($out + '.zip')
}
