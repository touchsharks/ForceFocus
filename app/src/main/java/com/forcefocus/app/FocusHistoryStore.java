package com.forcefocus.app;

import android.content.ContentResolver;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

final class FocusHistoryStore {
    private static final String TAG = "FF_HISTORY";
    private static final int MAX_RECORDS = 1000;
    private static final String JOURNAL_PREFIX = "forcefocus_pending_record_";
    private static final java.util.concurrent.ExecutorService WRITER = java.util.concurrent.Executors.newSingleThreadExecutor();
    private static final Object RECORD_LOCK = new Object();
    private static final Object BACKUP_IO_LOCK = new Object();
    private static final String BACKUP_FILE_NAME = "forcefocus_history_backup.json";

    private final Context context;
    private final SharedPreferences preferences;

    FocusHistoryStore(Context context) {
        this.context = context.getApplicationContext();
        this.preferences = new AppStateRepository(context).preferences();
        WRITER.execute(this::recoverPendingRecords);
    }

    boolean stageCompletedRecord(JSONObject record, Runnable onSaved) {
        JSONObject normalized = normalizeRecord(record);
        if (normalized == null) return false;
        String key = JOURNAL_PREFIX + normalized.optString("sessionId", normalized.optString("id"));
        // Only the small record is committed before acknowledgement; full merge/backup run off the bridge thread.
        if (!preferences.edit().putString(key, normalized.toString()).commit()) return false;
        WRITER.execute(() -> {
            synchronized (RECORD_LOCK) {
                addCompletedRecord(normalized);
                preferences.edit().remove(key).commit();
            }
            if (onSaved != null) onSaved.run();
        });
        return true;
    }

    private void recoverPendingRecords() {
        for (Map.Entry<String, ?> entry : preferences.getAll().entrySet()) {
            if (!entry.getKey().startsWith(JOURNAL_PREFIX) || !(entry.getValue() instanceof String)) continue;
            try {
                synchronized (RECORD_LOCK) {
                    addCompletedRecord(new JSONObject((String) entry.getValue()));
                    preferences.edit().remove(entry.getKey()).commit();
                }
            } catch (JSONException exception) { Log.e(TAG, "Invalid completion journal", exception); }
        }
    }

    JSONArray getRecords() {
        return parseArray(preferences.getString(AppStateRepository.KEY_RECORDS, "[]"));
    }

    JSONArray addCompletedRecord(JSONObject candidate) {
        synchronized (RECORD_LOCK) {
        JSONObject normalized = normalizeRecord(candidate);
        if (normalized == null) return getRecords();
        JSONArray merged = merge(getRecords(), new JSONArray().put(normalized));
        saveRecords(merged);
        backupAsync();
        return merged;
        }
    }

    JSONArray importRecords(String json) {
        synchronized (RECORD_LOCK) {
        JSONArray incoming = parseArray(json);
        JSONArray merged = merge(getRecords(), incoming);
        saveRecords(merged);
        backupAsync();
        return merged;
        }
    }

    JSONObject calendarMinutes(String monthKey) {
        JSONObject result = new JSONObject();
        if (monthKey == null || !monthKey.matches("\\d{4}-\\d{2}")) return result;
        Map<Integer, Long> seconds = new LinkedHashMap<>();
        JSONArray records = getRecords();
        for (int i = 0; i < records.length(); i++) {
            JSONObject value = records.optJSONObject(i);
            if (value == null) continue;
            String dateKey = value.optString("localDate", localDateKey(value.optLong("endTime", value.optLong("endedAt", 0L))));
            if (!dateKey.startsWith(monthKey + "-") || dateKey.length() < 10) continue;
            int day;
            try { day = Integer.parseInt(dateKey.substring(8, 10)); }
            catch (NumberFormatException exception) { continue; }
            long actual = Math.max(0L, value.optLong("actualFocusedSeconds", value.optLong("actualSeconds", 0L)));
            seconds.put(day, (seconds.containsKey(day) ? seconds.get(day) : 0L) + actual);
        }
        for (Map.Entry<Integer, Long> entry : seconds.entrySet()) {
            try { result.put(String.valueOf(entry.getKey()), Math.round(entry.getValue() / 60.0)); }
            catch (JSONException ignored) { }
        }
        return result;
    }

    JSONObject initializeHistory() {
        JSONObject status = new JSONObject();
        try {
            Uri tree = savedTreeUri();
            if (getRecords().length() > 0) {
                status.put("status", "ready");
                status.put("recordCount", getRecords().length());
                if (tree != null) backupAsync();
                return status;
            }
            if (tree == null) {
                status.put("status", "needs_authorization");
                status.put("recordCount", 0);
                return status;
            }
            int restored = restoreFromTree(tree);
            status.put("status", "ready");
            status.put("restored", restored);
            status.put("recordCount", getRecords().length());
        } catch (Exception exception) {
            Log.e(TAG, "initialize history failed", exception);
            try { status.put("status", "needs_authorization"); } catch (JSONException ignored) { }
        }
        return status;
    }

    int restoreFromTree(Uri treeUri) throws IOException {
        rememberTree(treeUri);
        Uri file = findBackupFile(treeUri, false);
        if (file == null) return 0;
        String json = readAll(context.getContentResolver(), file);
        synchronized (RECORD_LOCK) {
        JSONArray before = getRecords();
        JSONArray restored = parseBackup(json);
        JSONArray merged = merge(before, restored);
        saveRecords(merged);
        backupAsync();
        return Math.max(0, merged.length() - before.length());
        }
    }

    void rememberTree(Uri uri) {
        if (uri == null) return;
        preferences.edit().putString(AppStateRepository.KEY_BACKUP_TREE, uri.toString()).commit();
    }

    private Uri savedTreeUri() {
        String value = preferences.getString(AppStateRepository.KEY_BACKUP_TREE, "");
        return value.isEmpty() ? null : Uri.parse(value);
    }

    private void saveRecords(JSONArray records) {
        if (!preferences.edit().putString(AppStateRepository.KEY_RECORDS, records.toString()).commit()) throw new IllegalStateException("History disk write failed; journal retained");
    }

    private void backupAsync() {
        Uri tree = savedTreeUri();
        if (tree == null) return;
        new Thread(() -> {
            synchronized (BACKUP_IO_LOCK) {
            try {
                JSONArray snapshot = getRecords();
                JSONObject backup = new JSONObject();
                backup.put("schemaVersion", 1);
                backup.put("exportedAt", System.currentTimeMillis());
                backup.put("records", snapshot);
                Uri file = findBackupFile(tree, true);
                if (file == null) throw new IOException("Unable to create backup file");
                try (OutputStream output = context.getContentResolver().openOutputStream(file, "wt")) {
                    if (output == null) throw new IOException("Unable to open backup output");
                    output.write(backup.toString().getBytes(StandardCharsets.UTF_8));
                    output.flush();
                }
                Log.i(TAG, "backup complete records=" + snapshot.length());
            } catch (Exception exception) {
                Log.e(TAG, "backup failed", exception);
            }
            }
        }, "ForceFocusHistoryBackup").start();
    }

    private Uri findBackupFile(Uri treeUri, boolean create) throws IOException {
        ContentResolver resolver = context.getContentResolver();
        String treeId = DocumentsContract.getTreeDocumentId(treeUri);
        Uri root = DocumentsContract.buildDocumentUriUsingTree(treeUri, treeId);
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, treeId);
        String[] projection = { DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME };
        try (Cursor cursor = resolver.query(children, projection, null, null, null)) {
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    String id = cursor.getString(0);
                    String name = cursor.getString(1);
                    if (BACKUP_FILE_NAME.equals(name)) return DocumentsContract.buildDocumentUriUsingTree(treeUri, id);
                }
            }
        } catch (SecurityException exception) {
            throw new IOException("Backup permission unavailable", exception);
        }
        if (!create) return null;
        try {
            return DocumentsContract.createDocument(resolver, root, "application/json", BACKUP_FILE_NAME);
        } catch (Exception exception) {
            throw new IOException("Unable to create backup document", exception);
        }
    }

    private static String readAll(ContentResolver resolver, Uri uri) throws IOException {
        StringBuilder result = new StringBuilder();
        try (InputStream input = resolver.openInputStream(uri)) {
            if (input == null) throw new IOException("Unable to open backup input");
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
                char[] buffer = new char[8192];
                int count;
                while ((count = reader.read(buffer)) >= 0) result.append(buffer, 0, count);
            }
        }
        return result.toString();
    }

    private static JSONArray parseBackup(String json) {
        try {
            String value = json == null ? "" : json.trim();
            if (value.startsWith("[")) return new JSONArray(value);
            return new JSONObject(value).optJSONArray("records") == null
                    ? new JSONArray() : new JSONObject(value).optJSONArray("records");
        } catch (JSONException exception) {
            return new JSONArray();
        }
    }

    private static JSONArray parseArray(String json) {
        try { return new JSONArray(json == null ? "[]" : json); }
        catch (JSONException exception) { return new JSONArray(); }
    }

    private static JSONArray merge(JSONArray existing, JSONArray incoming) {
        Map<String, JSONObject> unique = new LinkedHashMap<>();
        appendNormalized(unique, existing);
        appendNormalized(unique, incoming);
        List<JSONObject> values = new ArrayList<>(unique.values());
        Collections.sort(values, (left, right) -> Long.compare(
                left.optLong("startTime", left.optLong("startedAt", 0L)),
                right.optLong("startTime", right.optLong("startedAt", 0L))));
        if (values.size() > MAX_RECORDS) values = values.subList(values.size() - MAX_RECORDS, values.size());
        JSONArray result = new JSONArray();
        for (JSONObject value : values) result.put(value);
        return result;
    }

    private static void appendNormalized(Map<String, JSONObject> unique, JSONArray source) {
        for (int i = 0; i < source.length(); i++) {
            JSONObject normalized = normalizeRecord(source.optJSONObject(i));
            if (normalized == null) continue;
            String id = normalized.optString("sessionId");
            JSONObject old = unique.get(id);
            if (old == null || normalized.length() >= old.length()) unique.put(id, normalized);
        }
    }

    static JSONObject normalizeRecord(JSONObject source) {
        if (source == null) return null;
        long start = source.optLong("startTime", source.optLong("startedAt", 0L));
        long end = source.optLong("endTime", source.optLong("endedAt", 0L));
        String taskName = source.optString("taskName", source.optString("task", ""));
        String taskId = source.optString("taskId", AppStateRepository.taskIdForName(taskName));
        String id = source.optString("sessionId", source.optString("id", start + "-" + taskId));
        if (start <= 0 || end < start || id.isEmpty()) return null;
        long actual = Math.max(0L, source.optLong("actualFocusedSeconds", source.optLong("actualSeconds", 0L)));
        int planned = Math.max(0, source.optInt("plannedMinutes", source.optInt("totalMinutes", 0)));
        JSONObject value = new JSONObject();
        try {
            value.put("id", id);
            value.put("sessionId", id);
            value.put("taskId", taskId);
            value.put("task", taskName);
            value.put("taskName", taskName);
            value.put("plannedMinutes", planned);
            value.put("startedAt", start);
            value.put("startTime", start);
            value.put("endedAt", end);
            value.put("endTime", end);
            value.put("actualSeconds", actual);
            value.put("actualFocusedSeconds", actual);
            value.put("actualFocusedMinutes", actual / 60.0);
            value.put("localDate", validDate(source.optString("localDate")) ? source.optString("localDate") : localDateKey(end > 0 ? end : start));
            value.put("endReason", source.optString("endReason", "unknown"));
            if (source.has("whitelistClickCount")) value.put("whitelistClickCount", Math.max(0, source.optInt("whitelistClickCount", 0)));
        } catch (JSONException ignored) { return null; }
        return value;
    }

    static String localDateKey(long timestamp) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(timestamp));
    }

    private static boolean validDate(String value) {
        return value != null && value.matches("\\d{4}-\\d{2}-\\d{2}");
    }
}
