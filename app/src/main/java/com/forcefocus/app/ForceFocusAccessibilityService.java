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
import android.view.inputmethod.InputMethodInfo;
import android.view.inputmethod.InputMethodManager;

import java.util.HashSet;
import java.util.Set;

public final class ForceFocusAccessibilityService extends AccessibilityService {
    private static final String TAG = "FF_A11Y";
    private static final long RELAUNCH_THROTTLE_MS = 650L;

    private final ContentObserver enabledStateObserver = new ContentObserver(new Handler(Looper.getMainLooper())) {
        @Override public void onChange(boolean selfChange) { logEnabledState("secure-setting-changed"); }
    };
    private boolean observerRegistered;
    private SystemEscapePolicy escapePolicy;
    private AppStateRepository repository;
    private String lastBlockedPackage = "";
    private long lastRelaunchAt;

    @Override
    public void onCreate() {
        super.onCreate();
        repository = new AppStateRepository(getApplicationContext());
        repository.resetAfterRebootIfNeeded();
        escapePolicy = new SystemEscapePolicy(getApplicationContext());
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
        String className = event.getClassName() == null ? "" : event.getClassName().toString();
        Log.d(TAG, "FF_A11Y event package=" + packageName + " type=" + event.getEventType()
                + " class=" + className + " window=" + event.getWindowId()
                + " focusActive=" + (repository != null && repository.isFocusActive()));
        FocusDeadlineReceiver.finishIfDue(getApplicationContext());
        if (packageName.isEmpty() || repository == null || !repository.isFocusActive()) return;
        // Keep Android security settings and the lock screen under system control.
        android.app.KeyguardManager keyguard = (android.app.KeyguardManager) getSystemService(KEYGUARD_SERVICE);
        if (keyguard != null && keyguard.isKeyguardLocked()) return;
        Set<String> allowed = repository.currentWhitelistPackages();
        boolean windowStateChanged = event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED;
        // A disappearing pane is not evidence that its app has become foreground.
        boolean paneDisappeared = event.getContentChangeTypes() == AccessibilityEvent.CONTENT_CHANGE_TYPE_PANE_DISAPPEARED;
        Set<String> imePackages = new HashSet<>();
        if (windowStateChanged && "android.inputmethodservice.SoftInputWindow".equals(className)) {
            // Use the supported IME API for targetSdk 35; no secure-setting writes or package scan.
            InputMethodManager manager = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
            try {
                if (manager != null) for (InputMethodInfo ime : manager.getEnabledInputMethodList()) {
                    imePackages.add(ime.getPackageName());
                }
            } catch (RuntimeException exception) { Log.w(TAG, "FF_A11Y IME lookup failed", exception); }
        }
        String decision = FocusWindowPolicy.decide(windowStateChanged, paneDisappeared,
                packageName, className, getPackageName(),
                escapePolicy != null && escapePolicy.allows(packageName, event), allowed, imePackages);
        Log.d(TAG, "FF_A11Y decision=" + decision + " package=" + packageName
                + " class=" + className + " type=" + event.getEventType()
                + " window=" + event.getWindowId() + " task=" + repository.currentTaskId()
                + " session=" + repository.currentSessionId() + " whitelistCount=" + allowed.size());
        if (!"block-not-in-current-task".equals(decision)) return;

        long now = SystemClock.elapsedRealtime();
        if (packageName.equals(lastBlockedPackage) && now - lastRelaunchAt < RELAUNCH_THROTTLE_MS) return;
        lastBlockedPackage = packageName;
        lastRelaunchAt = now;
        Log.w(TAG, "FF_A11Y blocked package=" + packageName + " class=" + className
                + " type=" + event.getEventType() + " task=" + repository.currentTaskId());

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
