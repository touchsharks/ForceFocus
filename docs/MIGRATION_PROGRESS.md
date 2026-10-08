# ForceFocus 当前工程状态

版本基准：0.3.3-home / versionCode 33，applicationId com.forcefocus.app。

标准 Android Gradle 工程已包含 WebView 前端代码、原生源码、Manifest、资源配置与 Gradle Wrapper。图片补齐后，app/src/main/assets/ 内共 246 个冻结资源：17 个代码/数据文件与 229 个图片。全部通过冻结 SHA-256 清单和远端 Git blob 校验，详见 verification/assets-restoration.json。

图片以普通 Git 文件保存。正常克隆后无需外部素材包或 Git LFS 图片下载。JDK 17、Android SDK 35 / Build Tools 35.0.0 为现有构建配置，构建入口及签名要求见根 README.md。

本次仅补齐资源和整理文档，不修改页面视觉、原生功能或版本号，不重新构建 APK。历史迁移信息可通过 Git 提交记录查阅；旧阶段状态不作为当前工程状态。

已删除被替代的 Windows 采集入口和两份重复签名记录；保留当前签名验证、APK 静态验证、素材恢复/校验工具、行为测试及紧急停止工具。私有签名密钥不提交仓库。
