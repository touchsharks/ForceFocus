# 2026-10-07 无障碍排查续接

GitHub 基准 c09786ac335f746c4442bc9e01db5e183ffc6295，用户确认手机安装 0.3.3。退出保障已实现，服务保持开启未通过实机验收。

旧日志证明 onCreate/onServiceConnected 后，在设置返回时 onDestroy；启用/绑定列表最终不含 ForceFocus。旧日志没有权限移除调用者或异常证据，不能把 OEM 策略、缺少悬浮快捷按钮或服务崩溃当成已确认原因。

## 当前操作

把 tools/capture-accessibility-windows.bat 放在 Windows platform-tools 中（与 adb.exe 同目录），手机连接并授权 USB 调试后双击。测试时保持未专注，关闭无障碍悬浮快捷按钮。按提示关闭再开启 ForceFocus 无障碍、允许、返回上一层，等待 10 秒，回电脑按回车。上传生成的 ZIP。

脚本只读取设备、权限、包、服务及进程退出状态，捕获系统 logcat；不写 secure settings，不启停组件，不清空历史日志。仅停止它自己创建的电脑端 logcat 进程。开始前和操作后均保存无障碍快照；完整日志用于追踪绑定、设置变化、异常和进程退出的先后关系。exit-info 在旧系统不支持时错误输出留在文件内，不阻止其他采集。

收到日志后逐项核对：实际安装版本、组件是否仍被紧急禁用、启用列表变化、Bound/Binding/Crashed 列表、FF_A11Y state/onUnbind/onDestroy、AndroidRuntime 和 ActivityManager 进程退出证据。没有足够证据前不更换拦截策略、不宣称修复、不要求悬浮按钮。冻结前端未改。
