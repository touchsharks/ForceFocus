# 无障碍独立保持开启：0.3.2排查版本

用户完整日志：03:14:00.532 onCreate，03:14:00.554 onServiceConnected；03:14:02.504 key_back_press、设置返回，03:14:02.586 onDestroy。dumpsys Enabled/Bound服务没有ForceFocus，Binding/Crashed为空。日志没有明确记录移除启用状态的调用者，不能确定vivo策略或具体根因。

0.3.2仅改原生Service/XML及版本号，所有assets与0.3.1一致。移除onServiceConnected冗余setServiceInfo与不使用的flagReportViewIds；Service onCreate不再调度定时器（已有会话保存/事件/Receiver定时路径保留）。新增onUnbind、enabled_accessibility_services只读观察与每阶段自身是否在系统启用列表的日志。诊断读取/注册异常捕获，不能因此导致服务崩溃。不写系统权限、不自动重启、不要求无障碍悬浮快捷按钮或悬浮窗。

Android官方文档支持XML静态配置：https://developer.android.com/guide/topics/ui/accessibility/views/service 。移除动态重复配置是缩小故障范围的对照修改，尚未证明它是根因或已修复。

验收：同签名覆盖0.3.1，不卸载；关闭悬浮按钮，系统设置开启并返回，等待后仍应开启。不进入专注也应独立绑定。若仍关闭，读取FF_A11Y中的onUnbind/secure-setting-changed和enabledInSecureSettings。当前实机未验证0.3.2。
