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
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 系统「保存到文件」选择器（SAF，ACTION_CREATE_DOCUMENT）。
 *
 * 为什么不用分享面板：实测这台机器上没有应用能接收 application/json，
 * 分享面板直接提示「没有应用可执行此操作」——备份能不能存下来居然取决于装了哪些 App。
 * SAF 是系统自带的，也不需要任何存储权限：由用户挑位置，我们只负责把字节写进去。
 *
 * 为什么不用 Filesystem 写公共目录：Android 11 起分区存储，
 * Environment 的公共 Documents/Downloads 不给写（要么申请 MANAGE_EXTERNAL_STORAGE，Play 会拒）。
 *
 * 为什么要分三步（begin / chunk / end）而不是一次传完整内容：
 * 一份 JSON 备份轻松几 MB，一次性作为参数穿过 Capacitor 桥会在同一时刻
 * 同时持有「JS 字符串 + 桥序列化副本 + Java String + 解码后的 byte[]」，
 * 低端机上直接 OutOfMemoryError 闪退。分块传，任一时刻内存里只有一小块。
 */
@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {

    /** 一次只开一个保存会话；token 只是防止并发调用写串了 */
    private int nextToken = 1;
    // 并发安全：插件方法跑在 Capacitor 的后台线程池上，begin/chunk/end 可能来自不同线程
    private final Map<Integer, OutputStream> streams = new ConcurrentHashMap<>();

    /** 用户挑好位置后，把输出流交给 JS，它再分块喂进来 */
    @PluginMethod
    public void begin(PluginCall call) {
        String filename = call.getString("filename");
        String mime = call.getString("mime", "application/octet-stream");
        if (filename == null) {
            call.reject("filename 是必需的");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(call, intent, "beginResult");
    }

    @ActivityCallback
    private void beginResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        JSObject ret = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            // 用户在选择器里按了返回，文件没留下
            ret.put("canceled", true);
            call.resolve(ret);
            return;
        }

        Uri uri = result.getData().getData();
        if (uri == null) {
            ret.put("canceled", true);
            call.resolve(ret);
            return;
        }

        try {
            // "wt" 会截断已有文件；个别文档提供者不认这个模式，退回默认的 "w"
            OutputStream out;
            try {
                out = getContext().getContentResolver().openOutputStream(uri, "wt");
            } catch (Exception fallback) {
                out = getContext().getContentResolver().openOutputStream(uri);
            }
            if (out == null) {
                call.reject("无法打开目标文件");
                return;
            }
            int token = nextToken++;
            streams.put(token, out);
            ret.put("canceled", false);
            ret.put("token", token);
            call.resolve(ret);
        } catch (Exception error) {
            call.reject("无法打开目标文件：" + error.getMessage(), error);
        }
    }

    /** 追加一块内容：data 是这一块的 base64，解码后写进已打开的流 */
    @PluginMethod
    public void chunk(PluginCall call) {
        Integer token = call.getInt("token");
        String data = call.getString("data");
        OutputStream out = token == null ? null : streams.get(token);
        if (out == null || data == null) {
            call.reject("没有打开的保存会话");
            return;
        }
        try {
            out.write(Base64.decode(data, Base64.DEFAULT));
            call.resolve();
        } catch (Exception error) {
            closeQuietly(streams.remove(token));
            call.reject("写入文件失败：" + error.getMessage(), error);
        }
    }

    /** 收尾：关流。写坏了也要把流关掉，别让系统选择器那边一直占着 */
    @PluginMethod
    public void end(PluginCall call) {
        Integer token = call.getInt("token");
        OutputStream out = token == null ? null : streams.remove(token);
        if (out == null) {
            call.reject("没有打开的保存会话");
            return;
        }
        JSObject ret = new JSObject();
        try {
            out.flush();
            out.close();
            ret.put("saved", true);
            call.resolve(ret);
        } catch (Exception error) {
            call.reject("写入文件失败：" + error.getMessage(), error);
        }
    }

    private void closeQuietly(OutputStream out) {
        if (out == null) return;
        try {
            out.close();
        } catch (Exception ignored) {
            // 已经出错了，这里只是别再漏一个流
        }
    }
}
