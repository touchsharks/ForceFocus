# ForceFocus migration checkpoint — 2026-10-05

## Verified inputs
- Repository: touchsharks/ForceFocus, main.
- Local prior checkpoint c2e5171 recovered; remote initially 593ebb7a.
- Baseline APK: ForceFocus-0.2.27-home.apk.
- All 246 assets in app/src/main/assets are byte-for-byte identical to baseline APK assets. No UI edits.

## Completed in this checkpoint
- Standard Gradle 8.9 Wrapper generated.
- tools/build.sh and tools/build_apk.py now invoke Gradle; no APK patching.
- Restored old native shell system-bar contrast settings, scrollbar/overscroll settings, physical display metrics, and WebView cleanup using baseline DEX inspection.
- Preserved custom task IDs when policy/session bridge calls arrive in either order.
- HistoryBackupActivity has real source, retained for Storage Access Framework directory authorization.

## Pending, do not claim fixed yet
- Upload all frontend assets (remote originally had none).
- Complete SDK/AGP dependency setup and run assembleDebug.
- Verify actual DEX class definitions and all Manifest components.
- Compare APK assets again after packaging.
- Audit deadline/background behavior and task-specific whitelist handling.
- Phone tests: service remains enabled; FF_A11Y lifecycle logs; allowed/blocked app switching; frozen page visuals.
- No phone or logcat evidence is available yet.

## Local working paths
- /workspace/scratch/d8151c3e4673/forcefocus
- /workspace/scratch/d8151c3e4673/recovery/ForceFocus-0.2.27-home.apk
- /tmp/ff-build/gradle-build.log

Runtime paths are temporary; GitHub is the continuation source.
