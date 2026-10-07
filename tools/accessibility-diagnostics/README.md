# 无障碍权限诊断（Windows）

把整个 accessibility-diagnostics 文件夹放进 platform-tools，连接手机并允许 USB 调试，双击 start.bat。按窗口提示依次测试系统设置开启、无障碍快捷按钮开启、未专注时切换微信。最后上传生成的 ZIP。

本轮不进入专注，不改系统权限、不改手机管家开关、不清除日志。新增采集安全中心服务状态、ForceFocus AppOps、安装来源和系统服务列表，以核对权限撤销前后的系统状态。OEM 可能不输出策略原因，采集不能保证直接获得内部规则。

报告含设备和应用使用信息，请仅私下提交，不上传公开仓库。源码脚本可公开，实际采集数据不可公开。

emergency-stop.bat 仅在你主动运行时停用 ForceFocus 无障碍组件；restore-component.bat 恢复组件可用性，服务仍须由你在系统设置开启。
