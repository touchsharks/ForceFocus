# forcefocus

ForceFocus 是一款以纸张、叶片和低饱和植物视觉为核心的 Android 专注应用。本仓库现已迁移为标准 Android Gradle 工程。现有 WebView HTML/CSS/JavaScript 和素材仍是唯一界面基底，原生层只负责 WebView 容器、数据桥、权限与系统服务。

## 重要边界

本项目不再依赖“基础 APK + 替换 assets”的正式构建方式。Manifest 中声明的 Activity/Service 都有真实源码并参与 DEX 编译。

## 目录

| 路径 | 内容 |
|---|---|
| `app/src/main/assets/` | 当前实际打包的完整 WebView 页面与素材 |
| `app/src/main/java/com/forcefocus/app/` | MainActivity、NativeBridge、无障碍服务与历史备份 |
| `app/src/main/res/xml/` | 无障碍配置、Auto Backup 与数据迁移规则 |
| `app-assets/` | 前端资源的可审阅镜像；与 assets 保持同步 |
| `docs/` | 架构、参数、素材和原生桥接说明 |
| `tools/` | 历史校验工具；旧 APK 补丁脚本不再用于正式构建 |

## 当前功能模块

- 常规首页：任务叶、中央圆、时间轴、最近三次专注时长、时长锁。
- 专注时钟：24枚刻度叶、倒计时折枝、蜘蛛白名单跳转、绝对时间戳恢复。
- 日历：45组枯叶/绿叶、每日实际专注比例、日期标记、昨日人格小票。
- 侧边栏：权限状态、工作内容1–4项、每任务0–2个白名单应用。
- 人格图鉴：78个人格、名称、点亮条件、已点亮彩色/未点亮灰度。
- FFTI：以真实专注记录为基础的规则结算与历史点亮数据。

## 开发与校验

```bash
python3 tools/validate_project.py --assets app-assets
./gradlew :app:assembleDebug
```

## 构建

安装 Android SDK 35 和 JDK 17 后执行：

```bash
./gradlew :app:assembleDebug
```

构建结果位于 `app/build/outputs/apk/`。发布版本应通过标准 Gradle signingConfig 使用私有密钥签名，密钥不得提交。

## GitHub 建议

本仓库配置 Git LFS 管理 PNG/JPG 等大体积素材。首次提交前执行：

```bash
git lfs install
git add .
git commit -m "Migrate ForceFocus to Android Gradle project"
git branch -M main
git remote add origin <你的 GitHub 仓库地址>
git push -u origin main
```

最终 APK 建议放在 GitHub Releases；签名私钥和密码不得上传。当前仓库未附加开源许可证，推送前请根据素材权属决定是否公开及采用何种许可证。
