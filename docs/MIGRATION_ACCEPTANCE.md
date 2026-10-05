# ForceFocus 0.3.0 Gradle migration acceptance

## Deliverables
- Full Android Gradle project ZIP includes the original 246 WebView assets and all native sources.
- APK built with standard Gradle 8.9 / AGP 8.7.3 / JDK 17 / SDK 35 / Build Tools 35.0.0.
- Package remains com.forcefocus.app; versionCode 30, versionName 0.3.0-home.
- assembleDebug and lintDebug pass. Lint reports 0 errors and 10 warnings (portrait orientation, deliberate synchronous preferences, required JavaScript, launcher icon).
- Signer is Android Debug; v1 and v2 signature verification pass. Original installed signer/private key is unavailable, so update compatibility is unverified.

## Native source layout

```text
app/src/main/java/com/forcefocus/app/
  MainActivity.java
  NativeBridge.java
  AppStateRepository.java
  ForceFocusAccessibilityService.java
  FocusDeadlineReceiver.java
  FocusHistoryStore.java
  HistoryBackupActivity.java
  SidebarSplitDrawable.java
app/src/main/res/xml/accessibility_service_config.xml
app/src/main/AndroidManifest.xml
app/src/main/assets/ForceFocus_v16.html
```

## MainActivity parity
WebView entry remains file:///android_asset/ForceFocus_v16.html. JavaScript, DOM storage and file access are enabled; content access and zoom are disabled; text zoom is 100. Bridge name remains NativeBridge. Real physical display size, density and status/navigation Insets are passed to setForceFocusMetrics. Existing front-end geometry and assets were not edited. SharedPreferences remain forcefocus_preferences; forcefocus_records and the WebView forcefocus_focus_records_v2 mirror remain compatible.

## Accessibility and history
Service independently extends AccessibilityService and implements/logs onCreate, onServiceConnected, onAccessibilityEvent, onInterrupt and onDestroy under FF_A11Y. It reads native active/task/whitelist/session state, never holds an Activity or WebView, allows ForceFocus and the current task whitelist, and relaunches the app for other packages with a throttled BACK fallback. Config listens to window-state/window changes and has no packageNames restriction.

HistoryBackupActivity is actually implemented and retained for Storage Access Framework directory authorization. Native alarm receiver handles deadlines and rescheduling after boot/package updates, while event-time checks prevent overdue restrictions. Without exact-alarm access, alarm timing is inexact; event-time expiry still checks the absolute deadline. History records and backup writes are serialized; old completion callbacks do not clear a different current session.

## Actual APK checks
Actual class_defs were read from DEX: 25 class definitions including MainActivity, NativeBridge, ForceFocusAccessibilityService, HistoryBackupActivity and FocusDeadlineReceiver. Every packaged Manifest component exists in DEX. See docs/verification/apk-debug.json for complete class list and APK hash. All 246 packaged asset filenames and contents match the frozen baseline manifest. Official apkanalyzer also confirms Chinese asset paths and packaged accessibility configuration. The verification script handles AGP ZIP UTF-8 names even when the UTF-8 flag is absent.

## Physical phone acceptance — pending
No Android device was connected. These have NOT been tested: all eight pages' visual parity, service toggle remains enabled after Allow/back, actual FF_A11Y lifecycle logcat, allowed app switching and non-whitelisted app blocking. Static checks do not establish physical-phone success.

Run on a connected device after a data-preserving install with a compatible signer:

```bash
adb logcat -c
adb logcat -v threadtime FF_A11Y:I FF_FOCUS:I '*:S'
```

Enable ForceFocus in Accessibility, allow and return. Confirm still enabled and record onCreate/onServiceConnected. Start a task, verify its whitelist app is allowed and another app is blocked. Repeat with a different task to prove whitelists are not merged. Check home/sidebar/permissions/work items/whitelist/focus/calendar/personality guide pages against the original.

If the toggle returns to disabled, physical-phone acceptance failed; do not claim fixed.

## Continuation
All code is on touchsharks/ForceFocus main. Image binaries are saved separately and their stable IDs are in MIGRATION_PROGRESS.md; GitHub binary upload did not finish. Restore exact images with tools/restore_frozen_assets.py, then build. Full source ZIP already contains raw images. tools/build.sh and tools/build_apk.py only invoke Gradle; no old APK is patched.
