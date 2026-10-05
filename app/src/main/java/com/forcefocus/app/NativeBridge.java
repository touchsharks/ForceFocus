package com.forcefocus.app;

import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.AlarmManager;
import android.content.ComponentName;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;
import android.view.HapticFeedbackConstants;
import android.view.accessibility.AccessibilityManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.text.Collator;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

public final class NativeBridge {
    private static final String TAG = "FF_BRIDGE";
    private static final String KEY_REMEMBERED = "forcefocus_saved_minutes";
    private static final Set<String> EXCLUDED_LABELS = new HashSet<>(Arrays.asList(
            "biubiu加速器", "Keep", "Play商店", "QQ", "UC浏览器", "vivo官网", "vivo健康", "vivo摄影",
            "一淘", "一键锁屏", "中国工商银行", "中国建设银行", "中国移动", "中国移动云盘", "主题",
            "云·星穹铁道", "云闪付", "互传", "京东", "代号鸢", "使用技巧", "免费电子书", "同程旅行",
            "咪咕视频", "天气", "天猫", "完美校园", "对讲机", "崩坏：星穹铁道", "应用商店",
            "意见反馈", "手机管家", "抖音", "招商银行", "拼多多", "指南针", "携程旅行", "支付宝",
            "新世界狂欢", "日历", "智慧生活", "智能遥控", "江西农商", "浏览器", "淘宝", "百度地图",
            "河马", "米游社", "绝区零", "美团", "美团外卖", "联系人", "蓝心小V", "薄荷健康",
            "解压专家", "钱包", "铁路12306", "闲鱼", "高德地图", "鲨鱼记账"
    ));

    private final ExecutorService appScanner = Executors.newSingleThreadExecutor();
    private final AtomicBoolean historyInitializing = new AtomicBoolean();
    private final AtomicBoolean scanRunning = new AtomicBoolean();
    private volatile String installedApps = "[]";
    private volatile Map<String, JSONObject> appMetadata = Collections.emptyMap();
    private volatile boolean closed;
    private volatile boolean rescanRequested;
    private final BroadcastReceiver packageChanges = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) { requestInstalledAppsRefresh(); }
    };
    private final MainActivity activity;
    private final WebView webView;
    private final AppStateRepository state;
    private final FocusHistoryStore history;

    NativeBridge(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.state = new AppStateRepository(activity);
        this.history = new FocusHistoryStore(activity);
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_PACKAGE_ADDED);
        filter.addAction(Intent.ACTION_PACKAGE_REMOVED);
        filter.addAction(Intent.ACTION_PACKAGE_CHANGED);
        filter.addDataScheme("package");
        if (Build.VERSION.SDK_INT >= 33) activity.registerReceiver(packageChanges, filter, Context.RECEIVER_NOT_EXPORTED);
        else activity.registerReceiver(packageChanges, filter);
    }

    synchronized void close() {
        closed = true;
        activity.unregisterReceiver(packageChanges);
        appScanner.shutdown();
    }

    @JavascriptInterface
    public synchronized void requestInstalledAppsRefresh() {
        if (closed) return;
        if (!scanRunning.compareAndSet(false, true)) { rescanRequested = true; return; }
        appScanner.execute(() -> {
            long started = android.os.SystemClock.elapsedRealtime();
            Log.i("FF_PERF", "app scan start elapsed=" + started);
            try {
                installedApps = scanInstalledApps();
                webView.post(() -> {
                    if (!closed) webView.evaluateJavascript("window.dispatchEvent(new Event('forcefocus:installed-apps-ready'));", null);
                });
            } catch (RuntimeException exception) { Log.e(TAG, "App scan failed", exception); }
            finally {
                scanRunning.set(false);
                Log.i("FF_PERF", "app scan ms=" + (android.os.SystemClock.elapsedRealtime() - started));
                if (rescanRequested && !closed) { rescanRequested = false; requestInstalledAppsRefresh(); }
            }
        });
    }

    @JavascriptInterface
    public void logPerformance(String stage, double elapsedMs) {
        Log.i("FF_PERF", stage + " ms=" + elapsedMs + " elapsed=" + android.os.SystemClock.elapsedRealtime());
        if ("home core first frame".equals(stage)) activity.recordHomeReady();
    }

    @JavascriptInterface
    public void enterFocus(String task, int minutes) {
        Log.i(TAG, "enterFocus task=" + task + " minutes=" + minutes);
    }

    @JavascriptInterface
    public void saveFocusSession(String task, int minutes, String startValue, String endValue, String whitelistJson) {
        long start = parseLong(startValue);
        long end = parseLong(endValue);
        state.saveFocusSession(task, minutes, start, end, whitelistJson);
        FocusDeadlineReceiver.schedule(activity);
    }

    @JavascriptInterface
    public String restoreFocusSession() {
        return state.restoreFocusSessionJson();
    }

    @JavascriptInterface
    public void setFocusModeActive(boolean active) {
        boolean valid = state.preferences().getLong(AppStateRepository.KEY_START, 0L) > 0L
                && state.preferences().getLong(AppStateRepository.KEY_END, 0L) > System.currentTimeMillis();
        state.setFocusActive(active && valid);
        FocusDeadlineReceiver.schedule(activity);
    }

    @JavascriptInterface
    public void setFocusSessionPolicy(String policyJson) {
        state.updateFocusPolicy(policyJson);
    }

    @JavascriptInterface
    public void completeFocusSession(String task, int plannedMinutes, String startValue, String endValue,
                                     int actualSeconds, String reason) {
        long start = parseLong(startValue);
        long end = parseLong(endValue);
        JSONObject record = baseRecord(task, plannedMinutes, start, end, actualSeconds, reason);
        history.addCompletedRecord(record);
        state.completeIfCurrent(record.optString("sessionId"));
    }

    @JavascriptInterface
    public void completeFocusSessionV2(String recordJson) {
        try {
            JSONObject record = new JSONObject(recordJson == null ? "{}" : recordJson);
            history.addCompletedRecord(record);
            state.completeIfCurrent(record.optString("sessionId", record.optString("id")));
        } catch (JSONException exception) {
            Log.e(TAG, "Invalid focus record", exception);
        }
    }

    @JavascriptInterface
    public boolean queueCompletedFocusSession(String recordJson) {
        try {
            JSONObject record = new JSONObject(recordJson);
            boolean staged = history.stageCompletedRecord(record, () -> webView.post(() -> {
                if (!closed) webView.evaluateJavascript("window.dispatchEvent(new Event('forcefocus:native-records-ready'));", null);
            }));
            if (staged) state.completeIfCurrent(record.optString("sessionId", record.optString("id")));
            return staged;
        } catch (JSONException exception) { Log.e(TAG, "Invalid completion journal", exception); return false; }
    }

    @JavascriptInterface
    public String getFocusRecords() {
        return history.getRecords().toString();
    }

    @JavascriptInterface
    public String importFocusRecordsToNative(String recordsJson) {
        return history.importRecords(recordsJson).toString();
    }

    @JavascriptInterface
    public String getCalendarFocusMinutes(String monthKey) {
        return history.calendarMinutes(monthKey).toString();
    }

    @JavascriptInterface
    public void requestFocusHistoryInitialization(boolean allowPrompt) {
        if (closed || !historyInitializing.compareAndSet(false, true)) return;
        FocusHistoryStore.runAsync(() -> {
            try {
                JSONObject payload = new JSONObject();
                payload.put("status", history.initializeHistory());
                payload.put("allowPrompt", allowPrompt);
                String script = "window.dispatchEvent(new CustomEvent('forcefocus:native-history-ready',{detail:"
                        + payload.toString() + "}));";
                webView.post(() -> { if (!closed) webView.evaluateJavascript(script, null); });
            } catch (JSONException exception) { Log.e(TAG, "History initialization failed", exception); }
            finally { historyInitializing.set(false); }
        });
    }

    @JavascriptInterface
    public String initializeFocusHistory() {
        return history.initializeHistory().toString();
    }

    @JavascriptInterface
    public void requestFocusHistoryBackupAccess() {
        activity.runOnUiThread(() -> activity.startActivity(new Intent(activity, HistoryBackupActivity.class)));
    }

    @JavascriptInterface
    public void saveRememberedMinutes(int minutes) {
        if (minutes > 0) state.preferences().edit().putInt(KEY_REMEMBERED, minutes).apply();
    }

    @JavascriptInterface
    public int restoreRememberedMinutes() {
        return state.preferences().getInt(KEY_REMEMBERED, 0);
    }

    @JavascriptInterface
    public String getEarlyExitState() {
        return state.preferences().getString(AppStateRepository.KEY_EARLY_EXIT, "");
    }

    @JavascriptInterface
    public void saveEarlyExitState(String json) {
        state.preferences().edit().putString(AppStateRepository.KEY_EARLY_EXIT, json == null ? "{}" : json).commit();
    }

    @JavascriptInterface
    public String getCalendarMarkedDates() {
        return state.preferences().getString(AppStateRepository.KEY_MARKED_DATES, "[]");
    }

    @JavascriptInterface
    public void setCalendarMarkedDates(String json) {
        state.preferences().edit().putString(AppStateRepository.KEY_MARKED_DATES, json == null ? "[]" : json).apply();
    }

    @JavascriptInterface
    public String getPermissionStates() {
        JSONObject result = new JSONObject();
        try {
            result.put("accessibility", isAccessibilityEnabled());
            result.put("overlay", Settings.canDrawOverlays(activity));
            result.put("exact", canScheduleExactAlarms());
        } catch (JSONException ignored) { }
        return result.toString();
    }

    @JavascriptInterface
    public void openPermissionSettings(String kind) {
        activity.runOnUiThread(() -> {
            Intent intent;
            if ("overlay".equals(kind)) {
                intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + activity.getPackageName()));
            } else if ("exact".equals(kind) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                        Uri.parse("package:" + activity.getPackageName()));
            } else {
                intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            }
            try { activity.startActivity(intent); }
            catch (RuntimeException exception) { activity.startActivity(new Intent(Settings.ACTION_SETTINGS)); }
        });
    }

    @JavascriptInterface
    public String getInstalledApps() { return installedApps; }

    private String scanInstalledApps() {
        PackageManager manager = activity.getPackageManager();
        Intent launcher = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> resolved = manager.queryIntentActivities(launcher, PackageManager.MATCH_ALL);
        Map<String, JSONObject> unique = new LinkedHashMap<>();
        for (ResolveInfo info : resolved) {
            if (info.activityInfo == null || info.activityInfo.packageName == null) continue;
            String packageName = info.activityInfo.packageName;
            if (packageName.equals(activity.getPackageName())) continue;
            CharSequence labelValue = info.loadLabel(manager);
            String label = labelValue == null ? packageName : labelValue.toString().trim();
            if (EXCLUDED_LABELS.contains(label) || AppCandidatePolicy.isExcluded(packageName, label)) continue;
            try {
                JSONObject value = new JSONObject();
                value.put("id", packageName);
                value.put("packageName", packageName);
                value.put("name", label);
                value.put("iconDataUrl", drawableDataUrl(info.loadIcon(manager)));
                unique.put(packageName, value);
            } catch (JSONException ignored) { }
        }
        appMetadata = new LinkedHashMap<>(unique);
        List<JSONObject> values = new ArrayList<>(unique.values());
        Collator collator = Collator.getInstance(Locale.CHINA);
        Collections.sort(values, (left, right) -> collator.compare(left.optString("name"), right.optString("name")));
        JSONArray result = new JSONArray();
        for (JSONObject value : values) result.put(value);
        return result.toString();
    }

    @JavascriptInterface
    public String getWhitelistAppInfo(String appId) {
        Set<String> packages = state.resolvePackageSet(new JSONArray().put(appId).toString());
        String packageName = packages.isEmpty() ? appId : packages.iterator().next();
        JSONObject result = new JSONObject();
        try {
            JSONObject cached = appMetadata.get(packageName);
            if (cached != null) return new JSONObject(cached.toString()).put("id", appId).put("installed", true).toString();
            PackageManager manager = activity.getPackageManager();
            ApplicationInfo info = manager.getApplicationInfo(packageName, 0);
            result.put("id", appId);
            result.put("packageName", packageName);
            result.put("name", manager.getApplicationLabel(info).toString());
            result.put("iconDataUrl", drawableDataUrl(manager.getApplicationIcon(info)));
            result.put("installed", true);
        } catch (Exception exception) {
            try {
                result.put("id", appId);
                result.put("packageName", packageName);
                result.put("name", appId);
                result.put("installed", false);
            } catch (JSONException ignored) { }
        }
        return result.toString();
    }

    @JavascriptInterface
    public boolean launchPackage(String packageName) {
        if (packageName == null || packageName.trim().isEmpty()) return false;
        if (state.isFocusActive() && !state.currentWhitelistPackages().contains(packageName.trim())) return false;
        Intent launch = activity.getPackageManager().getLaunchIntentForPackage(packageName.trim());
        if (launch == null) return false;
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try { activity.startActivity(launch); state.registerWhitelistLaunch(packageName.trim()); return true; }
        catch (RuntimeException exception) { return false; }
    }

    @JavascriptInterface
    public boolean launchWhitelistApp(String appId) {
        Set<String> packages = state.resolvePackageSet(new JSONArray().put(appId).toString());
        return !packages.isEmpty() && launchPackage(packages.iterator().next());
    }

    @JavascriptInterface
    public void performFocusHaptic(String kind) {
        activity.runOnUiThread(() -> {
            if (webView.performHapticFeedback(HapticFeedbackConstants.CONFIRM)) return;
            Vibrator vibrator = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator == null || !vibrator.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(24L, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                vibrator.vibrate(24L);
            }
        });
    }

    @JavascriptInterface public void onDurationLockClick() { Log.d(TAG, "duration lock click"); }
    @JavascriptInterface public void onModeIconClick() { Log.d(TAG, "mode icon click"); }
    @JavascriptInterface public void onSidebarClick() { Log.d(TAG, "sidebar click"); }
    @JavascriptInterface public void onSwipeRightToCalendar() { Log.d(TAG, "calendar swipe"); }

    @JavascriptInterface
    public void setSidebarSystemBarsVisible(boolean visible) {
        activity.setSidebarSystemBarsVisible(visible);
    }

    private boolean isAccessibilityEnabled() {
        AccessibilityManager manager = (AccessibilityManager) activity.getSystemService(Context.ACCESSIBILITY_SERVICE);
        if (manager == null) return false;
        ComponentName expected = new ComponentName(activity, ForceFocusAccessibilityService.class);
        for (AccessibilityServiceInfo info : manager.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)) {
            if (info.getResolveInfo() == null || info.getResolveInfo().serviceInfo == null) continue;
            ComponentName actual = new ComponentName(info.getResolveInfo().serviceInfo.packageName,
                    info.getResolveInfo().serviceInfo.name);
            if (expected.equals(actual)) return true;
        }
        return false;
    }

    private boolean canScheduleExactAlarms() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager manager = (AlarmManager) activity.getSystemService(Context.ALARM_SERVICE);
        return manager != null && manager.canScheduleExactAlarms();
    }

    private static long parseLong(String value) {
        try { return Math.round(Double.parseDouble(value)); }
        catch (Exception exception) { return 0L; }
    }

    private static JSONObject baseRecord(String task, int plannedMinutes, long start, long end, int actualSeconds, String reason) {
        JSONObject record = new JSONObject();
        String taskId = AppStateRepository.taskIdForName(task);
        String id = start + "-" + taskId;
        try {
            record.put("id", id);
            record.put("sessionId", id);
            record.put("taskId", taskId);
            record.put("task", task);
            record.put("taskName", task);
            record.put("plannedMinutes", plannedMinutes);
            record.put("startTime", start);
            record.put("endTime", end);
            record.put("actualFocusedSeconds", actualSeconds);
            record.put("localDate", FocusHistoryStore.localDateKey(end));
            record.put("endReason", reason == null ? "unknown" : reason);
            record.put("whitelistClickCount", 0);
        } catch (JSONException ignored) { }
        return record;
    }

    private static String drawableDataUrl(Drawable drawable) {
        if (drawable == null) return "";
        Bitmap bitmap;
        if (drawable instanceof BitmapDrawable && ((BitmapDrawable) drawable).getBitmap() != null) {
            bitmap = ((BitmapDrawable) drawable).getBitmap();
        } else {
            int width = Math.max(1, drawable.getIntrinsicWidth());
            int height = Math.max(1, drawable.getIntrinsicHeight());
            bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bitmap);
            drawable.setBounds(0, 0, width, height);
            drawable.draw(canvas);
        }
        int size = 96;
        Bitmap scaled = Bitmap.createScaledBitmap(bitmap, size, size, true);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        scaled.compress(Bitmap.CompressFormat.PNG, 100, output);
        return "data:image/png;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);
    }
}
