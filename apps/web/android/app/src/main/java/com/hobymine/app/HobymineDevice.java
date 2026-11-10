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

    // The last values actually sent to the web layer, so repeated layout
    // passes do not spam the bridge.
    private int lastTop = -1;
    private int lastBottom = -1;
    private int lastLeft = -1;
    private int lastRight = -1;

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
                top = bars.top;
                bottom = bars.bottom;
                left = bars.left;
                right = bars.right;
                notifyInsetsChanged();
                // The insets are not consumed: an edge-to-edge window still
                // lays the WebView out behind the bars.
                return windowInsets;
            });
            // The WebView is attached after load(); its position on screen
            // decides whether the window already sits inside the system bars.
            decor.getViewTreeObserver().addOnGlobalLayoutListener(this::notifyInsetsChanged);
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
     *
     * <p>When the window is <em>not</em> drawn edge to edge (Android 14 and
     * below with our theme), the framework already lays the WebView out inside
     * the status and navigation bars. Reporting the insets then would add a
     * second set of padding and leave large empty bands above the header and
     * below the bottom navigation, so they are reported as zero.
     */
    private JSObject insetsInCssPixels() {
        JSObject result = new JSObject();
        if (!isWebViewEdgeToEdge()) {
            result.put("top", 0);
            result.put("bottom", 0);
            result.put("left", 0);
            result.put("right", 0);
            return result;
        }

        float density = 1f;
        try {
            density = getContext().getResources().getDisplayMetrics().density;
        } catch (Exception ignored) {
            // A detached context keeps the 1:1 fallback.
        }
        if (density <= 0f) density = 1f;

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
     * True when the WebView starts at the very top-left of the screen, which
     * only happens when the window draws behind the system bars. A WebView
     * that starts below the status bar is laid out by the framework already
     * inside the safe area.
     */
    private boolean isWebViewEdgeToEdge() {
        try {
            View webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView == null || !webView.isAttachedToWindow()) {
                // Before the WebView exists there is nothing to double-pad;
                // report the real insets until the first layout settles.
                return true;
            }
            int[] location = new int[2];
            webView.getLocationOnScreen(location);
            return location[0] <= 1 && location[1] <= 1;
        } catch (Exception ignored) {
            // If the position cannot be read, prefer the edge-to-edge path:
            // a stray gap is safer than content hidden under the bars.
            return true;
        }
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
            JSObject current = insetsInCssPixels();
            int nextTop = current.getInteger("top", 0);
            int nextBottom = current.getInteger("bottom", 0);
            int nextLeft = current.getInteger("left", 0);
            int nextRight = current.getInteger("right", 0);
            if (nextTop == lastTop && nextBottom == lastBottom
                && nextLeft == lastLeft && nextRight == lastRight) {
                return;
            }
            lastTop = nextTop;
            lastBottom = nextBottom;
            lastLeft = nextLeft;
            lastRight = nextRight;
            notifyListeners("insetsChanged", current);
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
