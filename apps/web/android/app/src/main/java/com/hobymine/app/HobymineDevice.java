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

    /** Upper bounds for a realistic status/navigation bar, in CSS pixels. */
    private static final int MAX_VERTICAL_CSS = 56;
    private static final int MAX_HORIZONTAL_CSS = 80;

    // Insets are kept in physical pixels (as reported by WindowInsets) and
    // converted to CSS pixels only when they cross the bridge.
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
                // WindowInsets reports physical pixels; the web layer applies
                // CSS pixels, which are density independent. Keeping the raw
                // values made every high-density phone pad 2.5-3x too much.
                if (bars.top != top || bars.bottom != bottom
                    || bars.left != left || bars.right != right) {
                    top = bars.top;
                    bottom = bars.bottom;
                    left = bars.left;
                    right = bars.right;
                    notifyInsetsChanged();
                }
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
            call.resolve(insetsInCssPixels());
        } catch (Exception error) {
            // Fall back to zero insets instead of failing the bridge call.
            call.resolve(new JSObject());
        }
    }

    /**
     * Converts the stored physical-pixel insets into CSS pixels. The WebView
     * reports one CSS pixel per density-independent pixel, so dividing by the
     * display density keeps the app clear of the bars on every screen without
     * shrinking the layout on high-density phones.
     */
    private JSObject insetsInCssPixels() {
        float density = 1f;
        try {
            density = getContext().getResources().getDisplayMetrics().density;
        } catch (Exception ignored) {
            // A detached context keeps the 1:1 fallback.
        }
        if (density <= 0f) density = 1f;

        JSObject result = new JSObject();
        // The caps are a last line of defence: a status bar is never taller
        // than ~3rem in CSS pixels, so a larger value means we were handed
        // physical pixels and must not let it blow the layout apart.
        result.put("top", toCssPixels(top, density, MAX_VERTICAL_CSS));
        result.put("bottom", toCssPixels(bottom, density, MAX_VERTICAL_CSS));
        result.put("left", toCssPixels(left, density, MAX_HORIZONTAL_CSS));
        result.put("right", toCssPixels(right, density, MAX_HORIZONTAL_CSS));
        return result;
    }

    /**
     * Converts one inset from physical to CSS pixels and clamps it to a value a
     * real Android device can produce.
     */
    private int toCssPixels(int physicalPixels, float density, int maxCss) {
        int css = Math.round(physicalPixels / density);
        if (css < 0) return 0;
        return Math.min(css, maxCss);
    }

    /** Pushes fresh insets to the web layer after rotation or a bar change. */
    private void notifyInsetsChanged() {
        try {
            if (getBridge() == null) return;
            notifyListeners("insetsChanged", insetsInCssPixels());
        } catch (Exception ignored) {
            // The web layer also refreshes on resize, so a dropped event is safe.
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
