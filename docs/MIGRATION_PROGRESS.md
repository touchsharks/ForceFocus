## 当前续做入口：0.3.1-home（2026-10-06）

用户要求补齐0.2.26→0.2.27性能/白名单/每周两次提前结束处理，已完成代码及标准构建，提交34e49f0400d2fb58498b2791efb36a8df3797bfe；详见PERFORMANCE_UPDATE.md。4个JS仅改行为，HTML/CSS/图片未改。Gradle assembleDebug/lintDebug通过，0错误12警告，37 DEX类，所有Manifest组件存在，246assets验证通过。

新版APK ForceFocus-0.3.1-home-gradle.apk，library_file_id=libfile_e2ffc4052d0c8191a1b243a36342f05c，file_id=file_000000008b9c81f5a1a61bb2c621c068；SHA256=98427188f80b7385add212f5b655c221c4d5fe414df99fe4a20cc8a91dbb01a4。

阻塞：手机实际0.2.27证书27b6c4...，新版fc56a1cb...，已通过adb明确UPDATE_INCOMPATIBLE。找到的旧密钥均不匹配，run-as提示not debuggable，用户表示没有导出入口。用户还未授权卸载、改包名或丢失数据。不要重复让用户安装同签名不匹配的新包。实机速度、服务稳定开启、logcat及白名单阻断仍未验收。

---

# ForceFocus migration checkpoint — 2026-10-06

## Durable continuation sources
- GitHub: touchsharks/ForceFocus, main; prior checkpoints 5a418a3, 8560957, 35f1ffd, 3f56913.
- All native source, all 17 frozen HTML/CSS/JS/JSON files, Wrapper and DEX verifier are on GitHub.
- 229 unchanged image resources are saved as ForceFocus-frozen-image-assets-0.2.27.zip.
- Image archive Library ID: libfile_9b08ed6336ec8191b3bb7ad25b18648e; file ID: file_000000004d2481f489db8dde27ae24bc.
- Binary image upload to GitHub did NOT finish. Do not claim the repository alone is complete.
- Restore images with: python3 tools/restore_frozen_assets.py <image ZIP or original APK>.
- Gradle verifies all 246 resource hashes before packaging.

## Current checkpoint changes
- Preserve whitelist launch counts natively, including background timer records and session restoration.
- Older completion callbacks cannot clear a different current session.
- Serialize history record merges and backup writes.
- Explicit Build Tools 35.0.0 and fail-fast frozen resource verification.
- HistoryBackupActivity is implemented, retained for directory authorization.

## Build status
- Recovered from GitHub and image ZIP after temporary runtime was replaced.
- All 246 restored assets match the frozen SHA-256 manifest.
- Direct Gradle dependency download now works through the managed proxy with its CA certificate.
- Standard :app:assembleDebug succeeded with JDK 17 and Build Tools 35.0.0.
- Actual APK verification passed: 25 DEX classes, all 4 Manifest components implemented, all 246 assets unchanged.
- APK signature verification passed v1 and v2; current certificate is Android Debug.
- APK SHA-256: 4c97e98cfeadb0282b17c08fc0598449cb1fd18a934040dabc414926cfa55ce3.
- assembleDebug + lintDebug passed; no lint errors.
- Fixed vibration permission, API 23 collections/style compatibility and backup URI grant constants.
- Permission visibility uses existing launcher-app queries instead of QUERY_ALL_PACKAGES.
- Last build log: /workspace/scratch/23c46a324859/toolchain/build.log.
- Working root: /workspace/scratch/23c46a324859/forcefocus.

## Still required
- Final APK saved: ForceFocus-0.3.0-home-gradle-debug.apk, Library ID libfile_1b4d9e1ea04c8191ac3382ab8119b3f5, file ID file_00000000044881fbbf8ba2f8361ccaa1.
- Complete source archive: ForceFocus-0.3.0-Android-Gradle-project.zip (includes all 246 raw assets).
- Confirm new signer matches installed APK before attempting an update; old private signing key is not available.
- Physical phone service-enable test, FF_A11Y lifecycle logcat, per-task allowed/blocked apps, visual regression.
- No device was connected and no physical-phone evidence exists yet.

## Runtime network recovery
Use JDK 17, Gradle 8.9, SDK 35 / Build Tools 35.0.0.
Java does not automatically inherit HTTPS_PROXY or SSL_CERT_FILE.
When needed, provide the current proxy host/port as Java system properties and add the runtime CA to a temporary truststore.
Do not commit runtime credentials, CA, proxy ports or private signing keys.
