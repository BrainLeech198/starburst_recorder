package com.starburst.recorder;

import android.os.Environment;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * 清理临时缓存。
 *
 * 只动两类东西：WebView / 应用缓存目录里的临时文件，以及更新时下到应用外部目录的
 * APK。数据库、AI 配置这些都不在这里，删错一行记录比缓存清不干净严重得多。
 */
@CapacitorPlugin(name = "Cache")
public class CachePlugin extends Plugin {

    @PluginMethod
    public void clear(PluginCall call) {
        // clearCache 必须在 UI 线程调用；文件删除放到后台，别卡住界面
        getActivity().runOnUiThread(() -> {
            try {
                if (getBridge().getWebView() != null) {
                    getBridge().getWebView().clearCache(true);
                }
            } catch (Exception ignored) {
                // 缓存本来就可能被系统回收，清不掉内存缓存不算失败
            }

            new Thread(() -> {
                long bytes = 0;
                try {
                    bytes += deleteChildren(getContext().getCacheDir());
                    File downloads = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (downloads != null) bytes += deleteChildren(downloads);

                    JSObject result = new JSObject();
                    result.put("bytes", bytes);
                    call.resolve(result);
                } catch (Exception error) {
                    call.reject("清理缓存失败：" + error.getMessage(), error);
                }
            }).start();
        });
    }

    /** 删掉目录里的所有东西，但保留目录本身；返回删掉的字节数 */
    private long deleteChildren(File dir) {
        if (dir == null || !dir.exists()) return 0;
        File[] children = dir.listFiles();
        if (children == null) return 0;
        long bytes = 0;
        for (File child : children) {
            bytes += sizeOf(child);
            deleteTree(child);
        }
        return bytes;
    }

    private long sizeOf(File file) {
        if (file.isFile()) return file.length();
        File[] children = file.listFiles();
        if (children == null) return 0;
        long total = 0;
        for (File child : children) total += sizeOf(child);
        return total;
    }

    private void deleteTree(File file) {
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) deleteTree(child);
            }
        }
        // 删不掉就留着，不因为一个文件失败让整次清理报错
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }
}
