package com.forcefocus.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;
import org.json.JSONObject;

/** Native deadline handling works without an Activity or WebView. */
public final class FocusDeadlineReceiver extends BroadcastReceiver {
    static void schedule(Context context) {
        AppStateRepository state = new AppStateRepository(context);
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        PendingIntent operation = PendingIntent.getBroadcast(context, 4108,
                new Intent(context, FocusDeadlineReceiver.class),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        alarms.cancel(operation);
        if (!state.isFocusActive()) return;
        long end = state.preferences().getLong(AppStateRepository.KEY_END, 0L);
        if (end <= 0L) return;
        if (end <= System.currentTimeMillis()) { finishIfDue(context); return; }
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()) {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, end, operation);
            } else {
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, end, operation);
            }
        } catch (SecurityException exception) {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, end, operation);
        }
    }

    static synchronized void finishIfDue(Context context) {
        AppStateRepository state = new AppStateRepository(context);
        long end = state.preferences().getLong(AppStateRepository.KEY_END, 0L);
        long start = state.preferences().getLong(AppStateRepository.KEY_START, 0L);
        if (!state.isFocusActive() || start <= 0L || end <= start || System.currentTimeMillis() < end) return;
        try {
            JSONObject record = new JSONObject();
            String task = state.preferences().getString(AppStateRepository.KEY_TASK, "");
            String taskId = state.currentTaskId();
            String sessionId = state.currentSessionId();
            record.put("id", sessionId);
            record.put("sessionId", sessionId);
            record.put("taskId", taskId);
            record.put("task", task);
            record.put("taskName", task);
            record.put("plannedMinutes", state.preferences().getInt(AppStateRepository.KEY_TOTAL_MINUTES, 0));
            record.put("startTime", start);
            record.put("endTime", end);
            record.put("actualFocusedSeconds", (end - start) / 1000L);
            record.put("localDate", FocusHistoryStore.localDateKey(end));
            record.put("endReason", "timer");
            record.put("whitelistClickCount", 0);
            new FocusHistoryStore(context).addCompletedRecord(record);
            state.setFocusActive(false);
            Log.i("FF_FOCUS", "deadline completed session=" + sessionId);
        } catch (Exception exception) {
            Log.e("FF_FOCUS", "deadline completion failed", exception);
        }
    }

    @Override public void onReceive(Context context, Intent intent) {
        finishIfDue(context);
        schedule(context);
    }
}
