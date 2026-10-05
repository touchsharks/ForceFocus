package com.forcefocus.app;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.content.Intent;
import android.os.SystemClock;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;

import java.util.Set;

public final class ForceFocusAccessibilityService extends AccessibilityService {
    private static final String TAG = "FF_A11Y";
    private static final long RELAUNCH_THROTTLE_MS = 650L;

    private AppStateRepository repository;
    private String lastBlockedPackage = "";
    private long lastRelaunchAt;

    @Override
    public void onCreate() {
        super.onCreate();
        repository = new AppStateRepository(getApplicationContext());
        FocusDeadlineReceiver.schedule(getApplicationContext());
        Log.i(TAG, "FF_A11Y onCreate");
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        AccessibilityServiceInfo info = getServiceInfo();
        if (info != null) {
            info.eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED | AccessibilityEvent.TYPE_WINDOWS_CHANGED;
            info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC;
            info.notificationTimeout = 80L;
            info.flags |= AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS;
            setServiceInfo(info);
        }
        Log.i(TAG, "FF_A11Y onServiceConnected");
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        CharSequence packageNameValue = event.getPackageName();
        String packageName = packageNameValue == null ? "" : packageNameValue.toString();
        Log.d(TAG, "FF_A11Y event package=" + packageName + " type=" + event.getEventType());
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

    @Override
    public void onDestroy() {
        Log.i(TAG, "FF_A11Y onDestroy");
        super.onDestroy();
    }
}
