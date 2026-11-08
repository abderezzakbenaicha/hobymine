package com.hobymine.app;

import android.app.Activity;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Exposes the Android window insets to the web app.
 *
 * <p>From Android 15 (API 35) apps that target SDK 35 are drawn edge to edge,
 * which means the WebView extends behind the status bar. The web layer uses
 * these values to pad the top bar and the bottom navigation so nothing hides
 * under the system bars.
 */
@CapacitorPlugin(name = "HobymineDevice")
public class HobymineDevice extends Plugin {

    private int top = 0;
    private int bottom = 0;
    private int left = 0;
    private int right = 0;

    @Override
    public void load() {
        super.load();
        try {
            Activity activity = getActivity();
            if (activity == null || activity.getWindow() == null) return;

            View decor = activity.getWindow().getDecorView();
            if (decor == null) return;

            ViewCompat.setOnApplyWindowInsetsListener(decor, (view, windowInsets) -> {
                Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                );
                top = bars.top;
                bottom = bars.bottom;
                left = bars.left;
                right = bars.right;
                // The insets are not consumed: the WebView still lays out edge to
                // edge, the web layer adds the padding.
                return windowInsets;
            });
            ViewCompat.requestApplyInsets(decor);
        } catch (Exception error) {
            // A missing window only costs the safe-area padding, never the app.
        }
    }

    @PluginMethod
    public void getInsets(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("top", top);
            result.put("bottom", bottom);
            result.put("left", left);
            result.put("right", right);
            call.resolve(result);
        } catch (Exception error) {
            // Fall back to zero insets instead of failing the bridge call.
            call.resolve(new JSObject());
        }
    }

    /**
     * Keeps the status-bar and navigation-bar icons readable when the app theme
     * and the device theme disagree. Dark icons are used on the light palette,
     * light icons on the dark one.
     *
     * <p>This runs on every system light/dark switch, so it is defensive: the
     * appearance change is posted to the UI thread (window decorations may only
     * be touched there) and every failure resolves instead of rejecting, which
     * would surface as an unhandled rejection in the web layer.
     */
    @PluginMethod
    public void setSystemBarStyle(PluginCall call) {
        try {
            final boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
            final Activity activity = getActivity();
            if (activity == null || activity.getWindow() == null) {
                // No window to decorate; the system defaults stay in place.
                call.resolve();
                return;
            }
            activity.runOnUiThread(() -> {
                try {
                    View decor = activity.getWindow().getDecorView();
                    if (decor != null) {
                        WindowInsetsControllerCompat controller =
                            WindowCompat.getInsetsController(activity.getWindow(), decor);
                        if (controller != null) {
                            controller.setAppearanceLightStatusBars(!dark);
                            controller.setAppearanceLightNavigationBars(!dark);
                        }
                    }
                } catch (Exception error) {
                    // A window already being torn down: keep the default icons.
                }
                // Always settle the call, and never from inside a finally block
                // where a failure would surface as an uncaught UI-thread crash.
                try {
                    call.resolve();
                } catch (Exception ignored) {
                    // The call was already released by the bridge.
                }
            });
        } catch (Exception error) {
            call.resolve();
        }
    }
}
