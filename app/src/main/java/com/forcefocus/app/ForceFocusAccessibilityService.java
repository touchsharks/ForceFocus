package com.forcefocus.app;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.Intent;
import android.content.ComponentName;
import android.database.ContentObserver;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.os.SystemClock;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;

import java.util.Set;

public final class ForceFocusAccessibilityService extends AccessibilityService {
    private static final String TAG = "FF_A11Y";
    private static final long RELAUNCH_THROTTLE_MS = 650L;

    private final ContentObserver enabledStateObserver = new ContentObserver(new Handler(Looper.getMainLooper())) {
        @Override public void onChange(boolean selfChange) { logEnabledState("secure-setting-changed"); }
    };
    private boolean observerRegistered;
    private AppStateRepository repository;
    private String lastBlockedPackage = "";
    private long lastRelaunchAt;

    @Override
    public void onCreate() {
        super.onCreate();
        repository = new AppStateRepository(getApplicationContext());
        Log.i(TAG, "FF_A11Y onCreate");
        try {
            getContentResolver().registerContentObserver(
                    Settings.Secure.getUriFor(Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES), false, enabledStateObserver);
            observerRegistered = true;
        } catch (RuntimeException exception) { Log.w(TAG, "FF_A11Y state observer unavailable", exception); }
        logEnabledState("onCreate");
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        // XML is the single configuration source. No runtime rewrite or shortcut/overlay requirement.
        Log.i(TAG, "FF_A11Y onServiceConnected");
        logEnabledState("onServiceConnected");
        AccessibilityServiceInfo info = getServiceInfo();
        Log.i(TAG, "FF_A11Y config=" + (info == null ? "null" : info.toString()));
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        CharSequence packageNameValue = event.getPackageName();
        String packageName = packageNameValue == null ? "" : packageNameValue.toString();
        Log.d(TAG, "FF_A11Y event package=" + packageName + " type=" + event.getEventType()
                + " focusActive=" + (repository != null && repository.isFocusActive()));
        FocusDeadlineReceiver.finishIfDue(getApplicationContext());
        if (packageName.isEmpty() || repository == null || !repository.isFocusActive()) return;
        if (getPackageName().equals(packageName)) return;
        // Keep Android security settings and the lock screen under system control.
        android.app.KeyguardManager keyguard = (android.app.KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        if (keyguard != null && keyguard.isKeyguardLocked()) return;
        if ("com.android.systemui".equals(packageName) || "com.android.settings".equals(packageName)
                || "com.android.permissioncontroller".equals(packageName)
                || "com.google.android.permissioncontroller".equals(packageName)) return;
        Set<String> allowed = repository.currentWhitelistPackages();
        if (allowed.contains(packageName)) return;

        long now = SystemClock.elapsedRealtime();
        if (packageName.equals(lastBlockedPackage) && now - lastRelaunchAt < RELAUNCH_THROTTLE_MS) return;
        lastBlockedPackage = packageName;
        lastRelaunchAt = now;
        Log.w(TAG, "FF_A11Y blocked package=" + packageName + " task=" + repository.currentTaskId());

        Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (intent == null) { performGlobalAction(GLOBAL_ACTION_BACK); return; }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_CLEAR_TOP
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra("forcefocus_blocked_package", packageName);
        try {
            startActivity(intent);
        } catch (RuntimeException exception) {
            Log.e(TAG, "FF_A11Y relaunch failed", exception);
            performGlobalAction(GLOBAL_ACTION_BACK);
        }
    }

    @Override
    public void onInterrupt() {
        Log.w(TAG, "FF_A11Y onInterrupt");
    }

    private void logEnabledState(String phase) {
        try {
        String enabled = Settings.Secure.getString(getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        ComponentName own = new ComponentName(this, ForceFocusAccessibilityService.class);
        boolean listed = false;
        if (enabled != null) for (String flattened : enabled.split(":")) {
            if (own.equals(ComponentName.unflattenFromString(flattened))) { listed = true; break; }
        }
        Log.i(TAG, "FF_A11Y state phase=" + phase + " enabledInSecureSettings=" + listed
                + " focusActive=" + (repository != null && repository.isFocusActive()));
        } catch (RuntimeException exception) { Log.w(TAG, "FF_A11Y state unreadable phase=" + phase, exception); }
    }

    @Override
    public boolean onUnbind(Intent intent) {
        Log.w(TAG, "FF_A11Y onUnbind");
        logEnabledState("onUnbind");
        return super.onUnbind(intent);
    }

    @Override
    public void onDestroy() {
        Log.i(TAG, "FF_A11Y onDestroy");
        logEnabledState("onDestroy");
        if (observerRegistered) { getContentResolver().unregisterContentObserver(enabledStateObserver); observerRegistered = false; }
        super.onDestroy();
    }
}
