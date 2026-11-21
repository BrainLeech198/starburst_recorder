package com.starburst.recorder;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.MonthDay;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;

final class ScheduleReminderScheduler {
    private static final String PREFS = "schedule_reminders";
    private static final String KEY_ITEMS = "items";
    private static final String KEY_TITLE = "notification_title";
    private static final String CHANNEL_ID = "schedule_reminders";
    private static final String ACTION_FIRE = "com.starburst.recorder.SCHEDULE_REMINDER";
    private static final int MAX_REMINDERS = 40;

    private ScheduleReminderScheduler() {}

    static void sync(Context context, JSONArray rawItems, String notificationTitle) throws JSONException {
        cancelAll(context, readItems(context));
        JSONArray accepted = new JSONArray();
        for (int i = 0; i < rawItems.length() && accepted.length() < MAX_REMINDERS; i++) {
            JSONObject item = rawItems.optJSONObject(i);
            if (isValid(item)) accepted.put(item);
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_ITEMS, accepted.toString())
            .putString(KEY_TITLE, notificationTitle)
            .apply();
        scheduleAll(context, accepted);
    }

    static void onAlarm(Context context, Intent intent) {
        String id = intent.getStringExtra("scheduleId");
        String scheduledDate = intent.getStringExtra("scheduledDate");
        JSONArray items = readItems(context);
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null || !item.optString("id").equals(id)) continue;
            LocalDate today = LocalDate.now();
            LocalDate occurrence = parseDate(scheduledDate);
            if (occurrence != null && occurrence.equals(today) && occursOn(item, occurrence)) {
                postNotification(context, item);
            }
            scheduleNext(context, item, LocalDateTime.now());
            return;
        }
    }

    static void rescheduleAll(Context context) {
        JSONArray items = readItems(context);
        cancelAll(context, items);
        scheduleAll(context, items);
    }

    private static boolean isValid(JSONObject item) {
        if (item == null || item.optString("id").isEmpty() || item.optString("title").isEmpty()) return false;
        LocalDate start = parseDate(item.optString("dateKey"));
        String repeat = item.optString("repeat");
        if (start == null || !("none".equals(repeat) || "daily".equals(repeat) || "weekly".equals(repeat)
            || "monthly".equals(repeat) || "yearly".equals(repeat))) return false;
        LocalDate end = parseDate(item.optString("endDate"));
        if (end != null && end.isBefore(start)) return false;
        if ("weekly".equals(repeat) && !hasWeeklyDay(item.optJSONArray("weeklyDays"))) return false;
        if ("monthly".equals(repeat) && !hasMonthlyDay(item.optJSONArray("monthlyDays"))) return false;
        if ("yearly".equals(repeat) && !hasYearlyDate(item.optJSONArray("yearlyDates"))) return false;
        return true;
    }

    private static JSONArray readItems(Context context) {
        String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_ITEMS, "[]");
        try {
            return new JSONArray(raw);
        } catch (JSONException ignored) {
            return new JSONArray();
        }
    }

    private static void cancelAll(Context context, JSONArray items) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item != null) cancelAlarm(context, alarms, item.optString("id"));
        }
    }

    private static void cancelAlarm(Context context, AlarmManager alarms, String id) {
        PendingIntent pending = pendingIntent(context, id, null, PendingIntent.FLAG_NO_CREATE);
        if (pending != null) {
            alarms.cancel(pending);
            pending.cancel();
        }
    }

    private static PendingIntent pendingIntent(Context context, String id, String scheduledDate, int flags) {
        Intent intent = new Intent(context, ScheduleReminderReceiver.class);
        intent.setAction(ACTION_FIRE);
        intent.setData(Uri.parse("starburst-schedule://" + Uri.encode(id)));
        intent.putExtra("scheduleId", id);
        if (scheduledDate != null) intent.putExtra("scheduledDate", scheduledDate);
        int requestCode = id.hashCode();
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            flags | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static void scheduleAll(Context context, JSONArray items) {
        LocalDateTime now = LocalDateTime.now();
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item != null) scheduleNext(context, item, now);
        }
    }

    private static void scheduleNext(Context context, JSONObject item, LocalDateTime now) {
        if (!isValid(item)) return;
        LocalDate start = parseDate(item.optString("dateKey"));
        LocalDate end = parseDate(item.optString("endDate"));
        LocalTime time = parseTime(item.optString("time"));
        String repeat = item.optString("repeat");
        if ("none".equals(repeat) && (start.isBefore(now.toLocalDate())
            || (start.equals(now.toLocalDate()) && !LocalDateTime.of(start, time).isAfter(now)))) return;
        LocalDate candidate = now.toLocalDate().isBefore(start) ? start : now.toLocalDate();

        // 4 years covers every yearly selection, including a Feb 29 that only exists in leap years.
        for (int i = 0; i < 1465; i++, candidate = candidate.plusDays(1)) {
            if (end != null && candidate.isAfter(end)) return;
            if (!occursOn(item, candidate)) continue;
            LocalDateTime trigger = LocalDateTime.of(candidate, time);
            if (!trigger.isAfter(now)) continue;
            AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarms == null) return;
            PendingIntent pending = pendingIntent(
                context,
                item.optString("id"),
                candidate.toString(),
                PendingIntent.FLAG_UPDATE_CURRENT
            );
            alarms.setAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                trigger.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli(),
                pending
            );
            return;
        }
    }

    private static boolean occursOn(JSONObject item, LocalDate date) {
        LocalDate start = parseDate(item.optString("dateKey"));
        if (start == null || date.isBefore(start)) return false;
        LocalDate end = parseDate(item.optString("endDate"));
        if (end != null && date.isAfter(end)) return false;
        String repeat = item.optString("repeat");
        if ("none".equals(repeat)) return start.equals(date);
        if ("daily".equals(repeat)) return true;
        if ("weekly".equals(repeat)) {
            JSONArray days = item.optJSONArray("weeklyDays");
            if (days == null) return false;
            int weekday = date.getDayOfWeek().getValue(); // Monday=1 … Sunday=7
            for (int i = 0; i < days.length(); i++) {
                if (days.optInt(i, -1) == weekday) return true;
            }
            return false;
        }
        if ("monthly".equals(repeat)) {
            JSONArray days = item.optJSONArray("monthlyDays");
            if (days == null) return false;
            for (int i = 0; i < days.length(); i++) {
                if (days.optInt(i, -1) == date.getDayOfMonth()) return true;
            }
            return false;
        }
        if ("yearly".equals(repeat)) {
            JSONArray dates = item.optJSONArray("yearlyDates");
            if (dates == null) return false;
            String monthDay = String.format(java.util.Locale.ROOT, "%02d-%02d", date.getMonthValue(), date.getDayOfMonth());
            for (int i = 0; i < dates.length(); i++) {
                if (monthDay.equals(dates.optString(i))) return true;
            }
        }
        return false;
    }

    private static boolean hasWeeklyDay(JSONArray days) {
        if (days == null) return false;
        for (int i = 0; i < days.length(); i++) {
            int day = days.optInt(i, -1);
            if (day >= 1 && day <= 7) return true;
        }
        return false;
    }

    private static boolean hasMonthlyDay(JSONArray days) {
        if (days == null) return false;
        for (int i = 0; i < days.length(); i++) {
            int day = days.optInt(i, -1);
            if (day >= 1 && day <= 31) return true;
        }
        return false;
    }

    private static boolean hasYearlyDate(JSONArray dates) {
        if (dates == null) return false;
        for (int i = 0; i < dates.length(); i++) {
            String value = dates.optString(i, "");
            try {
                MonthDay.parse("--" + value);
                return true;
            } catch (DateTimeParseException ignored) {
                // Ignore malformed dates in a stored payload.
            }
        }
        return false;
    }

    private static LocalDate parseDate(String value) {
        try {
            return value == null || value.isEmpty() ? null : LocalDate.parse(value);
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }

    private static LocalTime parseTime(String value) {
        try {
            return value == null || value.isEmpty() ? LocalTime.of(9, 0) : LocalTime.parse(value);
        } catch (DateTimeParseException ignored) {
            return LocalTime.of(9, 0);
        }
    }

    private static void postNotification(Context context, JSONObject item) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        String title = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_TITLE, context.getString(R.string.app_name));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(new NotificationChannel(
                CHANNEL_ID,
                title,
                NotificationManager.IMPORTANCE_DEFAULT
            ));
        }
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent content = launch == null ? null : PendingIntent.getActivity(
            context,
            notificationId(item.optString("id")),
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(context, CHANNEL_ID)
            : new Notification.Builder(context);
        builder.setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle(title)
            .setContentText(item.optString("title"))
            .setAutoCancel(true)
            .setCategory(Notification.CATEGORY_REMINDER);
        if (content != null) builder.setContentIntent(content);
        manager.notify(notificationId(item.optString("id")), builder.build());
    }

    private static int notificationId(String id) {
        return 0x40000000 | (id.hashCode() & 0x3fffffff);
    }
}
