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
- Standard assembleDebug is pending JDK completion and APK verification.
- Last build log: /workspace/scratch/23c46a324859/toolchain/build.log.
- Working root: /workspace/scratch/23c46a324859/forcefocus.

## Still required
- Successful Gradle APK and real DEX check, signed APK verification.
- Confirm new signer matches installed APK before attempting an update; old private signing key is not available.
- Physical phone service-enable test, FF_A11Y lifecycle logcat, per-task allowed/blocked apps, visual regression.
- No device was connected and no physical-phone evidence exists yet.

## Runtime network recovery
Use JDK 17, Gradle 8.9, SDK 35 / Build Tools 35.0.0.
Java does not automatically inherit HTTPS_PROXY or SSL_CERT_FILE.
When needed, provide the current proxy host/port as Java system properties and add the runtime CA to a temporary truststore.
Do not commit runtime credentials, CA, proxy ports or private signing keys.
