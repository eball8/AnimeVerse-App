package com.animeverse.app;

import android.content.Intent;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;

// تسجيل الدخول بحساب غوغل محدد (البريد) مباشرة بدون إظهار قائمة الحسابات
@CapacitorPlugin(name = "GoogleHint")
public class GoogleHintPlugin extends Plugin {

    @PluginMethod
    public void signIn(PluginCall call) {
        String email = call.getString("email");

        int id = getContext().getResources().getIdentifier(
            "default_web_client_id", "string", getContext().getPackageName());
        if (id == 0) {
            call.reject("NO_WEB_CLIENT_ID");
            return;
        }

        GoogleSignInOptions.Builder builder = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(getContext().getString(id))
            .requestEmail();
        if (email != null && !email.isEmpty()) {
            builder.setAccountName(email);
        }

        GoogleSignInClient client = GoogleSignIn.getClient(getActivity(), builder.build());
        startActivityForResult(call, client.getSignInIntent(), "onSignInResult");
    }

    @ActivityCallback
    private void onSignInResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        try {
            GoogleSignInAccount account = GoogleSignIn.getSignedInAccountFromIntent(data).getResult(ApiException.class);
            String idToken = account.getIdToken();
            if (idToken == null) {
                call.reject("NO_ID_TOKEN");
                return;
            }
            JSObject ret = new JSObject();
            ret.put("idToken", idToken);
            call.resolve(ret);
        } catch (ApiException e) {
            // 12501 = المستخدم ألغى العملية
            call.reject("Google sign-in failed: " + e.getStatusCode(), String.valueOf(e.getStatusCode()));
        }
    }
}
