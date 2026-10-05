package com.forcefocus.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

final class AppStateRepository {
    static final String PREFS = "forcefocus_preferences";
    static final String KEY_RECORDS = "forcefocus_records";
    static final String KEY_FOCUS_ACTIVE = "forcefocus_active";
    static final String KEY_TASK = "forcefocus_task";
    static final String KEY_TASK_ID = "forcefocus_task_id";
    static final String KEY_TOTAL_MINUTES = "forcefocus_total_minutes";
    static final String KEY_START = "forcefocus_start_timestamp";
    static final String KEY_END = "forcefocus_end_timestamp";
    static final String KEY_WHITELIST = "forcefocus_whitelist";
    static final String KEY_WHITELIST_PACKAGES = "forcefocus_whitelist_packages";
    static final String KEY_SESSION_ID = "forcefocus_session_id";
    static final String KEY_WHITELIST_CLICKS = "forcefocus_whitelist_click_count";
    static final String KEY_EARLY_EXIT = "forcefocus_early_exit_week_v1";
    static final String KEY_MARKED_DATES = "forcefocus_calendar_marked_dates";
    static final String KEY_BACKUP_TREE = "forcefocus_history_backup_tree_uri";

    private static final Map<String, String> LEGACY_PACKAGES;
    static {
        Map<String, String> packages = new HashMap<>();
        packages.put("wps", "cn.wps.moffice_eng");
        packages.put("xiaohongshu", "com.xingin.xhs");
        packages.put("fenbi", "com.fenbi.android.servant");
        packages.put("recorder", "com.android.soundrecorder");
        LEGACY_PACKAGES = Collections.unmodifiableMap(packages);
    }

    private final SharedPreferences preferences;
    private final Context context;

    AppStateRepository(Context context) {
        this.context = context.getApplicationContext();
        preferences = this.context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    SharedPreferences preferences() {
        return preferences;
    }

    boolean isFocusActive() {
        return preferences.getBoolean(KEY_FOCUS_ACTIVE, false);
    }

    String currentTaskId() {
        return preferences.getString(KEY_TASK_ID, "");
    }

    String currentSessionId() {
        return preferences.getString(KEY_SESSION_ID, "");
    }

    Set<String> currentWhitelistPackages() {
        return resolvePackageSet(preferences.getString(KEY_WHITELIST_PACKAGES,
                preferences.getString(KEY_WHITELIST, "[]")));
    }

    void resetAfterRebootIfNeeded() {
        int bootCount = -1;
        try { bootCount = android.provider.Settings.Global.getInt(context.getContentResolver(), "boot_count", -1); }
        catch (RuntimeException ignored) { /* Older/OEM devices use boot epoch fallback. */ }
        long bootEpoch = System.currentTimeMillis() - android.os.SystemClock.elapsedRealtime();
        int previousBoot = preferences.getInt("forcefocus_last_boot_count", -1);
        long previousEpoch = preferences.getLong("forcefocus_last_boot_epoch", 0L);
        long sessionStart = preferences.getLong(KEY_START, 0L);
        boolean changed = bootCount >= 0 && previousBoot >= 0 ? bootCount != previousBoot
                : previousEpoch > 0L && Math.abs(bootEpoch - previousEpoch) > 60000L;
        boolean sessionPredatesBoot = sessionStart > 0L && sessionStart < bootEpoch - 2000L;
        if (changed || sessionPredatesBoot) setFocusActive(false);
        preferences.edit().putInt("forcefocus_last_boot_count", bootCount)
                .putLong("forcefocus_last_boot_epoch", bootEpoch).commit();
    }

    void saveFocusSession(String taskName, int minutes, long start, long end, String whitelistJson) {
        String taskId = taskName != null && taskName.equals(preferences.getString(KEY_TASK, ""))
                ? preferences.getString(KEY_TASK_ID, taskIdForName(taskName)) : taskIdForName(taskName);
        String sessionId = start + "-" + (taskId.isEmpty() ? taskName : taskId);
        int clicks = preferences.getLong(KEY_START, 0L) == start
                ? preferences.getInt(KEY_WHITELIST_CLICKS, 0) : 0;
        String normalizedWhitelist = packagesAsJson(resolvePackageSet(whitelistJson));
        preferences.edit()
                .putBoolean(KEY_FOCUS_ACTIVE, true)
                .putString(KEY_TASK, taskName == null ? "" : taskName)
                .putString(KEY_TASK_ID, taskId)
                .putInt(KEY_TOTAL_MINUTES, Math.max(0, minutes))
                .putLong(KEY_START, start)
                .putLong(KEY_END, end)
                .putString(KEY_WHITELIST, whitelistJson == null ? "[]" : whitelistJson)
                .putString(KEY_WHITELIST_PACKAGES, normalizedWhitelist)
                .putString(KEY_SESSION_ID, sessionId)
                .putInt(KEY_WHITELIST_CLICKS, clicks)
                .commit();
    }

    void updateFocusPolicy(String json) {
        try {
            JSONObject object = new JSONObject(json == null ? "{}" : json);
            String taskName = object.optString("taskName", object.optString("task", preferences.getString(KEY_TASK, "")));
            String taskId = object.optString("taskId", taskIdForName(taskName));
            JSONArray source = object.optJSONArray("currentWhitelistPackages");
            if (source == null) source = object.optJSONArray("whitelist");
            Set<String> packages = new HashSet<>();
            if (source != null) {
                for (int i = 0; i < source.length(); i++) packages.add(resolvePackage(source.optString(i)));
            }
            preferences.edit()
                    .putString(KEY_TASK, taskName)
                    .putString(KEY_TASK_ID, taskId)
                    .putString(KEY_SESSION_ID, preferences.getLong(KEY_START, 0L) + "-" + taskId)
                    .putString(KEY_WHITELIST_PACKAGES, packagesAsJson(packages))
                    .commit();
        } catch (JSONException ignored) {
            // Existing session values stay authoritative when malformed page data is received.
        }
    }

    void setFocusActive(boolean active) {
        SharedPreferences.Editor editor = preferences.edit().putBoolean(KEY_FOCUS_ACTIVE, active);
        if (!active) {
            editor.remove(KEY_TASK)
                    .remove(KEY_TASK_ID)
                    .remove(KEY_TOTAL_MINUTES)
                    .remove(KEY_START)
                    .remove(KEY_END)
                    .remove(KEY_WHITELIST)
                    .remove(KEY_WHITELIST_PACKAGES)
                    .remove(KEY_SESSION_ID)
                    .remove(KEY_WHITELIST_CLICKS);
        }
        editor.commit();
    }

    void completeIfCurrent(String sessionId) {
        if (sessionId != null && sessionId.equals(currentSessionId())) setFocusActive(false);
    }

    void registerWhitelistLaunch(String packageName) {
        if (isFocusActive() && currentWhitelistPackages().contains(packageName)) {
            preferences.edit().putInt(KEY_WHITELIST_CLICKS,
                    preferences.getInt(KEY_WHITELIST_CLICKS, 0) + 1).commit();
        }
    }

    String restoreFocusSessionJson() {
        if (!isFocusActive()) return "";
        long start = preferences.getLong(KEY_START, 0L);
        long end = preferences.getLong(KEY_END, 0L);
        if (start <= 0 || end <= start) return "";
        try {
            JSONObject value = new JSONObject();
            value.put("task", preferences.getString(KEY_TASK, ""));
            value.put("taskId", preferences.getString(KEY_TASK_ID, ""));
            value.put("totalMinutes", preferences.getInt(KEY_TOTAL_MINUTES, 0));
            value.put("startTimestamp", start);
            value.put("endTimestamp", end);
            value.put("sessionId", preferences.getString(KEY_SESSION_ID, ""));
            value.put("whitelistClickCount", preferences.getInt(KEY_WHITELIST_CLICKS, 0));
            value.put("whitelist", new JSONArray(preferences.getString(KEY_WHITELIST, "[]")));
            return value.toString();
        } catch (JSONException exception) {
            return "";
        }
    }

    Set<String> resolvePackageSet(String json) {
        Set<String> values = new HashSet<>();
        try {
            JSONArray array = new JSONArray(json == null ? "[]" : json);
            for (int i = 0; i < array.length(); i++) {
                String value = resolvePackage(array.optString(i));
                if (!value.isEmpty()) values.add(value);
            }
        } catch (JSONException ignored) { }
        return values;
    }

    String resolvePackage(String id) {
        if (id == null || id.trim().isEmpty()) return "";
        String value = id.trim();
        String[] candidates;
        if ("wps".equals(value)) candidates = new String[]{"cn.wps.moffice_eng", "cn.wps.moffice"};
        else if ("recorder".equals(value)) candidates = new String[]{"com.android.bbksoundrecorder", "com.android.soundrecorder",
                "com.google.android.apps.recorder", "com.sec.android.app.voicenote"};
        else candidates = new String[]{LEGACY_PACKAGES.containsKey(value) ? LEGACY_PACKAGES.get(value) : value};
        for (String candidate : candidates) {
            try { context.getPackageManager().getApplicationInfo(candidate, 0); return candidate; }
            catch (android.content.pm.PackageManager.NameNotFoundException ignored) { }
        }
        return candidates[0];
    }

    static String taskIdForName(String taskName) {
        if (taskName == null) return "";
        String value = taskName.trim();
        if (value.isEmpty()) return "";
        if (value.equals("简历")) return "resume";
        if (value.equals("岗位调研")) return "job_research";
        if (value.equals("考公")) return "civil_service";
        if (value.equals("磨耳朵")) return "listening";
        return value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_\\-]", "_");
    }

    static Set<String> parsePackageSet(String json) {
        Set<String> result = new HashSet<>();
        if (json == null || json.trim().isEmpty()) return result;
        try {
            JSONArray array = new JSONArray(json);
            for (int i = 0; i < array.length(); i++) addResolvedPackage(result, array.optString(i));
        } catch (JSONException ignored) {
            addResolvedPackage(result, json);
        }
        return result;
    }

    static void addResolvedPackage(Set<String> destination, String id) {
        if (id == null) return;
        String value = id.trim();
        if (value.isEmpty()) return;
        destination.add(LEGACY_PACKAGES.containsKey(value) ? LEGACY_PACKAGES.get(value) : value);
    }

    static String packagesAsJson(Set<String> packages) {
        List<String> values = new ArrayList<>(packages);
        Collections.sort(values);
        return new JSONArray(values).toString();
    }
}
