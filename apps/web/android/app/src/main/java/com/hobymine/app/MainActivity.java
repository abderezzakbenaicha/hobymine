package com.hobymine.app;

import android.graphics.Color;
import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/**
 * HobyMine's Android shell.
 *
 * <p>The hardware back button is handed to the web app first: it closes open
 * dialogs, then walks back through the app history, and only when the app has
 * nothing left to go back to does the press fall through to the system (the
 * app is backgrounded instead of being killed).
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HobyminePermissions.class);
        registerPlugin(HobymineDevice.class);
        registerPlugin(HobymineLocation.class);
        registerPlugin(HobymineNotifications.class);
        registerPlugin(HobymineAudio.class);
        registerPlugin(HobymineSecurity.class);
        super.onCreate(savedInstanceState);
        // The app draws edge to edge on Android 15+, so the WebView is painted
        // in the app background colour instead of white behind the status bar.
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.setBackgroundColor(Color.parseColor("#F4F5F8"));
        }
    }

    @Override
    public void onBackPressed() {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            super.onBackPressed();
            return;
        }

        webView.evaluateJavascript(
            "(function(){try{"
                + "return typeof window.__hobymineBack === 'function' "
                + "? !!window.__hobymineBack() : false;"
                + "}catch(e){return false;}})()",
            value -> {
                if (!"true".equals(value)) {
                    // The web app had nothing to handle: send the app to the
                    // background instead of closing it.
                    moveTaskToBack(true);
                }
            }
        );
    }
}
