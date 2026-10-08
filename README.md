# ForceFocus

当前使用基准：**0.3.3-home（versionCode 33）**，applicationId `com.forcefocus.app`。
标准 Android Gradle 工程，现有 WebView HTML/CSS/JS 与素材继续作为唯一界面。首页、侧边栏、专注页、日历和图鉴的冻结视觉保持不变。

## 安装与验收

功能维护包含无障碍服务、按任务生效的白名单和重启安全退出。权限稳定、任务限制、性能与系统退出路径应分别执行运行验收；静态检查不能替代实机检查。

安装更新优先通过手机文件管理器调用系统安装界面，使用同 applicationId、同签名 APK 覆盖安装，保留数据。ADB 保留用于诊断；安装路径作为单独测试条件记录。详见 [安装与权限验收流程](tools/accessibility-diagnostics/README.md)。

## 工程目录

| 路径 | 用途 |
|---|---|
| `app/src/main/assets/` | WebView 页面、脚本及恢复后的图片素材 |
| `app/src/main/java/com/forcefocus/app/` | Activity、JS Bridge、持久化、无障碍服务、定时与安全退出逻辑 |
| `app/src/main/res/` | 服务配置、主题和备份规则 |
| `frozen-assets/manifest.json` | 冻结素材校验清单 |
| `gradle/`、`gradlew`、Gradle 配置 | 标准编译工具与配置 |
| `tools/` | 素材恢复、Gradle 构建入口、APK 静态检查、诊断与行为测试 |
| `docs/verification/apk-0.3.3.json` | 当前版本 DEX、Manifest 和素材静态检查记录 |
| `docs/verification/signature-0.3.3.txt` | 当前版本签名验证记录 |
| `docs/REPOSITORY_CLEANUP.md` | 待决定的旧文件清理建议 |

## 恢复资源与构建

**GitHub 已包含全部 246 个冻结资源：17 个前端代码/数据文件和 229 个原始图片。克隆后无需再寻找聊天中的素材包。**
图片以普通 Git 文件保存，不依赖 Git LFS 下载。完整性验证见 [资源补齐记录](docs/verification/assets-restoration.json)。

安装 JDK 17、Android SDK 35 / Build Tools 35.0.0 后：

```bash
./gradlew :app:assembleDebug
python3 tools/verify_apk.py app/build/outputs/apk/debug/app-debug.apk
```

构建时自动检查冻结素材。上述 debug 构建默认签名不等于当前使用的更新签名；交付更新包必须使用已有私有签名密钥，并验证证书一致。私钥、密码和本地配置不提交 GitHub。

## 历史说明

`docs/MIGRATION_PROGRESS.md` 和旧版排查文件包含当时的未完成状态，按历史记录阅读，当前入口以本 README 为准。仓库保留历史提交，本次已删除 3 个被替代或重复的文件并补齐图片；不改应用代码、不产生新 APK。
