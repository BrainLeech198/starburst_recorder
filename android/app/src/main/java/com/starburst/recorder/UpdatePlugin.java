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
 * 下载是异步的，但 call 要等到下载完才解决：前端的进度条靠「await 没返回」撑着，
 * 早解决等于进度条刚亮就被收走。失败就 reject，让前端说一句「下载失败」，
 * 下次启动还会提示，用户也能自己去 Release 下。
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
                JSObject done = new JSObject();
                done.put("ok", true);
                call.resolve(done);
            } catch (Exception error) {
                // 网络或写入失败：前端把进度条收掉、提示一句失败，下次启动还会再提示
                call.reject("下载失败：" + error.getMessage(), error);
            }
        }).start();
    }

    /**
     * 用系统浏览器打开官网这类链接。
     *
     * 必须包 try/catch：设备上没有浏览器、或者 URL 不合法，startActivity 会抛
     * ActivityNotFoundException / IllegalArgumentException——插件方法里漏掉的异常
     * 会一路冒到主线程把整个应用带崩，而"打开官网"这种外围功能不该有这个杀伤力。
     */
    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url 是必需的");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("打不开这个链接：" + error.getMessage(), error);
        }
    }

    private InputStream open(String url) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(30000);
        connection.setInstanceFollowRedirects(true);
        connection.connect();
        return connection.getInputStream();
    }

    /**
     * 拉起系统安装器。
     *
     * 这里也可能抛：文件不在 FileProvider 配的目录里、或者设备没有包安装器，
     * 都会抛异常。调用方已经在外层 try 里，但单独说一句免得以后有人把它挪出去。
     */
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
