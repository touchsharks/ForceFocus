# 无障碍维护入口

现有维护工具位于 tools/accessibility-diagnostics/。Windows 使用时，将整个文件夹放入 platform-tools，并运行 start.bat；具体流程以该目录 README.md 为准。

旧的 tools/capture-accessibility-windows.bat 已被替代并删除。采集报告仅私下用于诊断，不提交公开仓库。无障碍权限保持、当前任务白名单及系统安全退出应分别验收，不能仅据 Manifest 或静态校验认定运行结果。

当前构建和素材状态见根 README.md，当前素材完整性见 assets-restoration.json。
