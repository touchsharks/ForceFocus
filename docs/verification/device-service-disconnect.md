# 实机无障碍绑定后约1秒销毁

用户反馈0.3.1：不希望依靠系统无障碍悬浮按钮维持开启；关闭按钮后服务打开返回列表会关闭。之前部分非白名单App有阻断反应，打开微信时曾自动关闭服务。当前优先稳定独立开启，暂停导航路径修改。

用户提供的过滤日志确实包含：
- 03:10:54.953 FF_A11Y onCreate
- 03:10:54.964 FF_A11Y onServiceConnected
- 03:10:56.102 FF_A11Y onDestroy
- 03:10:59.250 FF_A11Y onCreate
- 03:10:59.260 FF_A11Y onServiceConnected
- 03:11:00.138 FF_A11Y onDestroy

两次PID都是32027，日志里没有AndroidRuntime异常，但日志只保留指定tag，因此不足以排除其他系统日志中的原因。源码检索无disableSelf/stopSelf/stopService/setComponentEnabledSetting/ENABLED_ACCESSIBILITY_SERVICES修改。服务实现类确实运行，不是旧版DEX缺类。

下一步采集不筛tag的logcat（所有buffers），并在返回后关闭状态立即采集dumpsys accessibility，确定断开服务的系统原因。当前不得声称已修复，不能用悬浮按钮或反复开启作为验收通过依据。暂不根据未知原因修改配置或权限。
