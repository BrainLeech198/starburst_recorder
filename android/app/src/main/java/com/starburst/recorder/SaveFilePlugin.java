package com.starburst.recorder;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;

/**
 * 系统「保存到文件」选择器（SAF，ACTION_CREATE_DOCUMENT）。
 *
 * 为什么不用分享面板：实测这台机器上没有应用能接收 application/json，
 * 分享面板直接提示「没有应用可执行此操作」——备份能不能存下来居然取决于装了哪些 App。
 * SAF 是系统自带的，也不需要任何存储权限：由用户挑位置，我们只负责把字节写进去。
 *
 * 为什么不用 Filesystem 写公共目录：Android 11 起分区存储，
 * Environment 的公共 Documents/Downloads 不给写（要么申请 MANAGE_EXTERNAL_STORAGE，Play 会拒）。
 */
@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {

    /** 系统选择器返回之前，先把要写的内容放在这儿（同一时刻只会有一个保存流程） */
    private byte[] pendingData;

    @PluginMethod
    public void save(PluginCall call) {
        String filename = call.getString("filename");
        String data = call.getString("data");
        if (filename == null || data == null) {
            call.reject("filename 和 data 都是必需的");
            return;
        }
        String mime = call.getString("mime", "application/octet-stream");

        try {
            pendingData = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            call.reject("内容不是合法的 base64");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(call, intent, "saveResult");
    }

    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        byte[] bytes = pendingData;
        pendingData = null;

        JSObject ret = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            // 用户在选择器里按了返回
            ret.put("saved", false);
            call.resolve(ret);
            return;
        }

        Uri uri = result.getData().getData();
        if (uri == null || bytes == null) {
            ret.put("saved", false);
            call.resolve(ret);
            return;
        }

        try (OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
            if (out == null) {
                ret.put("saved", false);
                call.resolve(ret);
                return;
            }
            out.write(bytes);
            out.flush();
            ret.put("saved", true);
            call.resolve(ret);
        } catch (Exception error) {
            call.reject("写入文件失败：" + error.getMessage(), error);
        }
    }
}
