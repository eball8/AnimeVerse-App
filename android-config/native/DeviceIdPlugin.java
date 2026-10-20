package com.animeverse.app;

import android.annotation.SuppressLint;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

// معرّف جهاز ثابت: يبقى كما هو بعد مسح بيانات التطبيق أو إعادة تثبيته،
// ويتغير فقط عند إعادة ضبط المصنع أو استخدام هاتف جديد (ANDROID_ID).
@CapacitorPlugin(name = "DeviceId")
public class DeviceIdPlugin extends Plugin {

    // قيمة معروفة مكسورة في بعض الأجهزة القديمة (مشتركة بين أجهزة كثيرة)
    private static final String BROKEN_ANDROID_ID = "9774d56d682e549c";

    @SuppressLint("HardwareIds")
    @PluginMethod
    public void get(PluginCall call) {
        try {
            String androidId = Settings.Secure.getString(
                getContext().getContentResolver(), Settings.Secure.ANDROID_ID);

            if (androidId == null || androidId.isEmpty()
                || BROKEN_ANDROID_ID.equals(androidId)) {
                call.reject("NO_ANDROID_ID");
                return;
            }

            // نخزّن بصمة مشفرة فقط وليس المعرّف الخام
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(
                ("animeverse:" + androidId).getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) sb.append(String.format("%02x", b));

            JSObject ret = new JSObject();
            ret.put("id", "d_" + sb.substring(0, 40));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("DEVICE_ID_FAILED");
        }
    }
          }
