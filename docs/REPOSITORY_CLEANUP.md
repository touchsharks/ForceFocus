# 仓库清理建议（待用户决定）

当前使用基准为 0.3.3-home / versionCode 33。本清单只提出整理方案，未执行删除或移动；不改源码和冻结视觉。检查基准提交 e90008bc8a2dc78c622934fae7a2f5dfa44160e1。

## 必须保留

- app/ 原生源码、前端代码、资源、Manifest 和 app/build.gradle。
- 根目录 Gradle 配置、Wrapper、VERSION.json。
- frozen-assets/manifest.json、tools/restore_frozen_assets.py、tools/verify_apk.py。
- tools/tests/ 三项行为测试。
- docs/verification/apk-0.3.3.json、signature-0.3.3.txt、safety-0.3.3.md。
- tools/accessibility-diagnostics/：诊断入口和紧急停止/恢复工具，虽暂时不用仍有维护价值。
- 签名说明应保留或合并，私钥保持在仓库外；同签名是后续覆盖更新的必要条件。

## 建议归档而非删除

下列文件可移动到 docs/archive/，保留查错与迁移依据。移动时同步更新其他 Markdown 中的相对链接和命令引用。

| 文件 | 理由 |
|---|---|
| docs/MIGRATION_PROGRESS.md | 多阶段续接信息混在一起，包含已解除的阻塞；另含图片包恢复标识，归档后仍须可查 |
| docs/MIGRATION_ACCEPTANCE.md | 迁移阶段验收记录，部分状态过时 |
| docs/verification/device-service-disconnect.md | 早期服务关闭排查 |
| docs/verification/device-service-disconnect-0.3.2.md | 0.3.2 排查历史 |
| docs/verification/accessibility-next-session.md | 已完成的旧续接步骤 |
| docs/verification/installed-apk-conflict.md | 历史签名冲突 |
| docs/verification/original-apk-signature.md | 旧证书调查 |
| docs/verification/signing-key-recovered.md | 签名恢复历史，可提炼为当前签名维护说明后归档 |
| docs/verification/apk-debug.json | 早期 debug APK 校验 |
| docs/verification/apk-0.3.1.json | 旧版校验 |
| docs/verification/apk-0.3.2.json | 旧版校验 |

保留 docs/PERFORMANCE_UPDATE.md，属于已有性能与行为改动说明，不因权限问题解决而作废。

## 可以删除的少量重复文件（待同意）

| 文件 | 删除前提/影响 |
|---|---|
| tools/capture-accessibility-windows.bat | 已有 tools/accessibility-diagnostics/ 替代；先更新历史文档引用 |
| docs/verification/signature-0.3.1.txt | Git blob 与当前 0.3.3 签名文件完全相同；保留历史提交和当前签名记录即可 |
| docs/verification/signature-0.3.2.txt | 同上 |

## 可选择精简，非必须

`tools/build_apk.py` 现在只有调用 Gradle 的功能，不再是旧 APK 二进制补丁脚本。可以保留兼容旧入口；若统一直接运行 Gradle，可删除并同步修改 docs/MIGRATION_ACCEPTANCE.md 中的描述。tools/build.sh 也只是便捷入口，暂时保留。

## 仍需补齐的保存项

GitHub 中缺少 229 个图片文件，且本树没有可安装 APK。它们是当前恢复依赖，不属于无用文件。完整保存当前版本，应另安排上传冻结图片和已验证 APK（例如 Release 附件），并继续保留对应签名密钥。不要把大素材、旧版 APK 或密钥未经检查全部删除。

本次不重写 Git 历史；历史提交仍可用于追溯。删旧文档仅整理当前目录，不会显著减少仓库体积。
