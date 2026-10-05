# 0.3.3 safety release

Priority: restore user control after a focus session trapped the device.

- BOOT_COMPLETED and MY_PACKAGE_REPLACED discard the unfinished native session and cancel its alarm. No history completion or early-exit charge is created.
- MainActivity and independently created accessibility service check boot identity before restoring/enforcing. This covers missed boot broadcasts after force-stop.
- Native empty session is authoritative: the WebView removes stale local session data rather than resurrecting it.
- System settings, permission controllers, installer/uninstaller and discovered HOME launchers are always allowed. Home intentionally remains an escape route, including OEM launcher-hosted uninstall dialogs.
- Application management/uninstall handlers are discovered with package visibility queries; ordinary app restrictions remain task-scoped.
- Update from 0.3.1/0.3.2 keeps the same signing certificate and preserves completed history, tasks, whitelist bindings and weekly early-exit count. The currently unfinished focus is discarded deliberately.
- No frozen HTML/CSS/image parameters changed; only focus.js session restoration changed.

Emergency Windows ADB command (reversible, no data deletion):

```bat
adb shell pm disable-user --user 0 com.forcefocus.app/com.forcefocus.app.ForceFocusAccessibilityService
```

After installing this safety update and confirming the normal home screen:

```bat
adb shell pm enable com.forcefocus.app/com.forcefocus.app.ForceFocusAccessibilityService
```

Phone acceptance still required: reboot discards focus without consuming early exit; uninstall confirmation/settings remain reachable; no overlay required; actual service enable-state stability is not claimed solved by this release.

## Build verification

Gradle assembleDebug + lintDebug passed. JS session restoration, weekly early exit and app exclusion regression tests passed. APK DEX contains 39 classes including the actual service and SystemEscapePolicy; every Manifest component has an implementation. 245 of 246 assets are byte-identical to 0.3.2; only focus.js restoration behavior changed. Signature verified, same fc56a1cbdeed6729667358a436d4cc8d470a7d6b3d6b36a05dd79efab1789306 certificate as 0.3.1/0.3.2.

APK SHA256: de676745b3e5e5b0e3dddbcbe7bf09a72bedfddabbceb1bc545e2334458b66d8.

Phone tests have not been performed in this workspace.
