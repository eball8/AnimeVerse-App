package com.animeverse.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GalleryPlugin.class);
        registerPlugin(GoogleHintPlugin.class);
        registerPlugin(DeviceIdPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
