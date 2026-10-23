package com.animeverse.app;

import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;

// يفتح رابط الحلقة داخل EZV Player (com.player.easy) بنفس طريقة تطبيق Anime Slayer:
// ACTION_VIEW + ExoPlayerActivity + extras (title, anime_title, qualities, default_quality, headers)
// ملاحظة مهمة: لا نستخدم from_network أبدًا، لأنه يجعل EZV يتجاهل qualities ووضع WebView.
// - رابط فيديو مباشر (mp4/m3u8...): يمرَّر داخل qualities فيشغّله ExoPlayer.
// - رابط صفحة (embed): يُضاف له #webview_indicated فيفتحه EZV داخل WebView الخاص به.
@CapacitorPlugin(name = "EzvPlayer")
public class EzvPlayerPlugin extends Plugin {

    private static final String EZV_PACKAGE = "com.player.easy";
    private static final String EZV_ACTIVITY = "com.player.easy.player.ExoPlayerActivity";
    private static final String WEBVIEW_TAG = "#webview_indicated";
    private static final String DEFAULT_UA =
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) "
        + "Chrome/124.0.0.0 Mobile Safari/537.36";

    private boolean installed() {
        try {
            getContext().getPackageManager().getPackageInfo(EZV_PACKAGE, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    private static boolean isDirectVideo(String url) {
        String u = url.toLowerCase(Locale.ROOT);
        int cut = u.indexOf('#');
        if (cut >= 0) u = u.substring(0, cut);
        String noQuery = u.contains("?") ? u.substring(0, u.indexOf('?')) : u;
        String[] exts = { ".mp4", ".m3u8", ".mkv", ".webm", ".mpd", ".mov", ".avi", ".ts" };
        for (String e : exts) {
            if (noQuery.endsWith(e)) return true;
        }
        return u.contains(".m3u8") || u.contains(".mp4");
    }

    private static String originOf(String url) {
        try {
            Uri u = Uri.parse(url);
            if (u.getScheme() == null || u.getHost() == null) return null;
            return u.getScheme() + "://" + u.getHost() + (u.getPort() > 0 ? ":" + u.getPort() : "") + "/";
        } catch (Exception e) {
            return null;
        }
    }

    // روابط MEGA العادية (/file/) لا تُشغَّل كفيديو؛ نحوّلها لصيغة embed التي تعرض مشغّلًا.
    private static String toEmbedIfMega(String url) {
        try {
            Uri u = Uri.parse(url);
            String host = u.getHost();
            if (host == null) return url;
            host = host.toLowerCase(Locale.ROOT);
            boolean mega = host.equals("mega.nz") || host.endsWith(".mega.nz")
                || host.equals("mega.io") || host.endsWith(".mega.io");
            if (mega && url.contains("/file/")) {
                return url.replace("/file/", "/embed/");
            }
        } catch (Exception ignored) {
        }
        return url;
    }

    @PluginMethod
    public void isInstalled(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("installed", installed());
        call.resolve(ret);
    }

    @PluginMethod
    public void play(PluginCall call) {
        String url = call.getString("url");
        String title = call.getString("title", "");
        String referer = call.getString("referer");

        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("INVALID_URL");
            return;
        }
        if (!installed()) {
            call.reject("NOT_INSTALLED");
            return;
        }

        url = toEmbedIfMega(url);
        boolean direct = isDirectVideo(url);
        if (referer == null || referer.isEmpty()) referer = originOf(url);

        // الصفحات (embed) تحتاج الوسم ليفتحها EZV داخل WebView، والروابط المباشرة تبقى كما هي.
        String finalUrl = direct ? url : (url.contains(WEBVIEW_TAG) ? url : url + WEBVIEW_TAG);

        // EZV يتطلب عنوانين غير فارغين (title و anime_title) وإلا يغلق نفسه فورًا.
        String safeTitle = (title == null || title.trim().isEmpty()) ? "AnimeVerse" : title.trim();

        try {
            JSONArray qualities = new JSONArray()
                .put(new JSONObject().put("title", "Auto").put("url", finalUrl));

            JSONArray headers = new JSONArray();
            if (referer != null) {
                headers.put(new JSONObject().put("name", "Referer").put("value", referer));
            }
            headers.put(new JSONObject().put("name", "User-Agent").put("value", DEFAULT_UA));

            // نفس صيغة Anime Slayer تمامًا (بدون from_network وبدون path)
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(Uri.parse(finalUrl), "video/*");
            intent.setPackage(EZV_PACKAGE);
            intent.setComponent(new ComponentName(EZV_PACKAGE, EZV_ACTIVITY));
            intent.putExtra("title", safeTitle);
            intent.putExtra("anime_title", safeTitle);
            intent.putExtra("qualities", qualities.toString());
            intent.putExtra("default_quality", 0);
            intent.putExtra("skip_from", 0L);
            intent.putExtra("skip_to", 0L);
            intent.putExtra("headers", headers.toString());
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("NOT_SUPPORTED");
        } catch (Exception e) {
            call.reject("LAUNCH_FAILED");
        }
    }
}
