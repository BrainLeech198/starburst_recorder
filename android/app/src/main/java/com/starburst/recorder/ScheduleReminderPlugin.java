package com.starburst.recorder;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

@CapacitorPlugin(name = "ScheduleReminder")
public class ScheduleReminderPlugin extends Plugin {
    @PluginMethod
    public void sync(PluginCall call) {
        JSONArray items = call.getArray("items");
        String title = call.getString("title");
        try {
            ScheduleReminderScheduler.sync(
                getContext(),
                items == null ? new JSONArray() : items,
                title == null || title.isEmpty() ? getContext().getString(R.string.app_name) : title
            );
            call.resolve();
        } catch (Exception error) {
            call.reject("同步日程提醒失败", error);
        }
    }
}
