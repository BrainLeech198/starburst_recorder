package com.starburst.recorder;

import android.content.Intent;
import android.net.Uri;
import android.os.Environment;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * 应用内下载 APK 并拉起系统安装。
 *
 * 为什么不用 DownloadManager：它落到公共下载目录，回来的是 content:// 或需要额外权限，
 * 还得监听广播；这里直接下到应用自己的外部目录（Android 10 起不需要任何存储权限），
 * 再用已经配好的 FileProvider 换成 content:// 交给安装器，链路最短。
 *
 * 下载是异步的：先把 call 解决掉（前端弹一句「开始下载」），
 * 下完再起安装界面；失败就安静放弃——下次启动还会提示，用户也能自己去 Release 下。
 */
@CapacitorPlugin(name = "Update")
public class UpdatePlugin extends Plugin {

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        String fileName = call.getString("fileName", "starburst-update.apk");
        if (url == null || url.isEmpty()) {
            call.reject("url 是必需的");
            return;
        }

        File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) {
            call.reject("拿不到下载目录");
            return;
        }
        if (!dir.exists() && !dir.mkdirs()) {
            call.reject("下载目录建不出来");
            return;
        }

        File target = new File(dir, fileName.replaceAll("[\\\\/:*?\"<>|]", "_"));
        call.resolve();

        new Thread(() -> {
            try (InputStream input = open(url); FileOutputStream output = new FileOutputStream(target)) {
                long total = 0;
                java.net.URL parsed = new java.net.URL(url);
                java.net.HttpURLConnection probe = (java.net.HttpURLConnection) parsed.openConnection();
                probe.setRequestMethod("HEAD");
                probe.connect();
                total = probe.getContentLengthLong();
                probe.disconnect();

                byte[] buffer = new byte[64 * 1024];
                long received = 0;
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                    received += read;
                    JSObject payload = new JSObject();
                    payload.put("received", received);
                    payload.put("total", total > 0 ? total : 0);
                    notifyListeners("progress", payload, false);
                }
                install(target);
            } catch (Exception ignored) {
                // 网络或写入失败：不打扰用户
            }
        }).start();
    }

    /** 用系统浏览器打开官网这类链接 */
    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url 是必需的");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    private InputStream open(String url) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);
        connection.setInstanceFollowRedirects(true);
        connection.connect();
        return connection.getInputStream();
    }

    private void install(File apk) {
        Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }
}
