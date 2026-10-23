package com.animeverse.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// يفتح رابط الحلقة مباشرة داخل EZV Player (com.player.easy) دون المرور بالمتصفح.
@CapacitorPlugin(name = "EzvPlayer")
public class EzvPlayerPlugin extends Plugin {

    private static final String EZV_PACKAGE = "com.player.easy";

    private boolean installed() {
        try {
            getContext().getPackageManager().getPackageInfo(EZV_PACKAGE, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
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

        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("INVALID_URL");
            return;
        }
        if (!installed()) {
            call.reject("NOT_INSTALLED");
            return;
        }

        // المحاولة الأولى: رابط فيديو صريح. الثانية: بدون نوع، إن لم يقبله المشغل.
        String[] types = new String[] { "video/*", null };
        for (String type : types) {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW);
                Uri uri = Uri.parse(url);
                if (type != null) intent.setDataAndType(uri, type);
                else intent.setData(uri);
                intent.setPackage(EZV_PACKAGE);
                intent.putExtra("title", title);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve();
                return;
            } catch (ActivityNotFoundException e) {
                // جرّب الصيغة التالية
            } catch (Exception e) {
                call.reject("LAUNCH_FAILED");
                return;
            }
        }
        call.reject("NOT_SUPPORTED");
    }
}
