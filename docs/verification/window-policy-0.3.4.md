# 0.3.4 window event policy

The previous native service interpreted every subscribed event package as a newly
foreground app. Window metadata changes and keyboard windows can therefore
trigger a return from an allowed app. The observed false return has no paired
event log yet; its exact triggering package is not confirmed.

Changes:

- Window metadata events are observed for diagnostics, but do not trigger blocking.
- A disappearing accessibility pane does not trigger blocking.
- SoftInputWindow from an enabled Android input method is a supporting window.
  Other Activities in the same input method package still require the task whitelist.
- Current task whitelist, system settings/uninstall escape, and reboot cancellation
  remain in place. No frontend asset or accessibility capability is changed.
- Decision logs include package, class, event type, window, task, session and whitelist
  count, without logging entered text or window contents.

Local checks: `bash tools/tests/focus-window-policy.sh` covers 11 cases including
keyboard settings, spoofed keyboard class, task changes and non-whitelisted apps.
`node tools/tests/session-safety.cjs` checks native cancellation cannot be resurrected.

Device acceptance is pending: launch a task-bound app, open search/keyboard,
reopen from Home, switch to another non-whitelisted app, finish normally, and reboot.
If false blocking persists, capture `FF_A11Y` decisions to identify the actual package
and event before making any broader exemptions. No device success is claimed here.

Build verification: Gradle 8.9 / AGP 8.7.3 / Java 17 `:app:assembleRelease` passed.
APK versionCode is 34. All four Manifest components have real DEX definitions,
including ForceFocusAccessibilityService; FocusWindowPolicy also exists in DEX.
All 246 frozen assets match the existing SHA256 manifest. APK v1/v2/v3 signatures
verify with the existing certificate SHA256
`fc56a1cbdeed6729667358a436d4cc8d470a7d6b3d6b36a05dd79efab1789306`.
APK verification details are in `apk-0.3.4.json`.

References: Android AccessibilityEvent and InputMethodManager API documentation.
