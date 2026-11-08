package com.hobymine.app;

import android.Manifest;
import android.annotation.TargetApi;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.ContentObserver;
import android.database.Cursor;
import android.hardware.display.DisplayManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.Display;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.function.Consumer;

/**
 * Window-level screenshot and screen-recording protection.
 *
 * <p>While a secure context is active (a 1-on-1 chat or a video call) the
 * activity window is marked with {@link WindowManager.LayoutParams#FLAG_SECURE}
 * so Android excludes its pixels from screenshots, screen recordings, casting
 * and the recent-apps preview.
 *
 * <p>Capture attempts are reported through several independent paths:
 *
 * <ul>
 *   <li>Android 14+ {@link android.app.Activity#registerScreenCaptureCallback}
 *       reports the screenshot chord.</li>
 *   <li>Android 15+ {@link WindowManager#addScreenRecordingCallback} reports
 *       when the app becomes visible in a screen recording.</li>
 *   <li>A {@link MediaStore} observer catches screenshots saved by OEM
 *       screenshot gestures and the power-menu screenshot button, which do not
 *       always reach the activity callback. When photo access is available the
 *       new row is checked for a screenshot name and a screen-sized image;
 *       without photo access the media change is paired with the window-focus
 *       loss caused by the screenshot overlay.</li>
 *   <li>A {@link DisplayManager} listener reports virtual displays created by
 *       screen recorders and casters on every Android version.</li>
 * </ul>
 *
 * <p>Blocking never depends on detection: {@code FLAG_SECURE} is applied before
 * any observer starts, and the pipeline only decides whether the other person
 * receives an alert. The API-specific callback types live in static nested
 * classes so the plugin still loads on much older devices.
 */
@CapacitorPlugin(name = "HobymineSecurity")
public class HobymineSecurity extends Plugin {

    private static final String TAG = "HobymineSecurity";

    /** Collapses duplicate signals (callback + MediaStore observer) for one attempt. */
    private static final long ATTEMPT_DEDUPE_MS = 1000;
    /** The screenshot overlay briefly moves focus away from the activity. */
    private static final long FOCUS_GRACE_MS = 6000;
    /** Wait for MediaStore to publish a finished screenshot row. */
    private static final long MEDIA_SETTLE_MS = 600;

    /** Remembers the last request so the flag survives an activity restart. */
    private boolean secureRequested = false;
    private boolean activityResumed = false;

    private Activity monitoredActivity;
    private ScreenshotMonitor screenshotMonitor;
    private RecordingMonitor recordingMonitor;
    private ScreenshotObserver screenshotObserver;
    private RecordingDisplayMonitor recordingDisplayMonitor;
    private ViewTreeObserver focusObserver;
    private ViewTreeObserver.OnWindowFocusChangeListener focusListener;
    private Activity focusActivity;

    private Handler mainHandler;
    private boolean mediaCheckQueued = false;
    private long lastFocusLostAt = 0;
    private final Map<String, Long> lastAttemptAt = new HashMap<>();

    @PluginMethod
    public void setSecure(PluginCall call) {
        final boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        secureRequested = enabled;

        final Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity is not available");
            return;
        }

        activity.runOnUiThread(() -> {
            applySecureFlag(activity, enabled);
            if (enabled) {
                startMonitoring(activity);
            } else {
                stopMonitoring();
            }
            call.resolve(status(activity));
        });
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(status(getActivity()));
    }

    @Override
    protected void handleOnStart() {
        super.handleOnStart();
        // The bridge can outlive an activity recreation; put the flag back and
        // re-register the observers on the new window.
        Activity activity = getActivity();
        if (secureRequested && activity != null) {
            applySecureFlag(activity, true);
            startMonitoring(activity);
        }
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        activityResumed = true;
    }

    @Override
    protected void handleOnPause() {
        activityResumed = false;
        super.handleOnPause();
    }

    @Override
    protected void handleOnDestroy() {
        stopMonitoring();
        super.handleOnDestroy();
    }

    private void applySecureFlag(Activity activity, boolean enabled) {
        if (enabled) {
            activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        } else {
            activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
    }

    private void startMonitoring(Activity activity) {
        // A recreated window needs fresh callbacks. Drop the old references
        // without unregistering from the activity that is already gone.
        if (monitoredActivity != activity) {
            screenshotMonitor = null;
            recordingMonitor = null;
            monitoredActivity = activity;
        }

        if (screenshotMonitor == null) {
            screenshotMonitor = createScreenshotMonitor(activity);
        }
        if (screenshotMonitor != null) {
            screenshotMonitor.start();
        }

        if (recordingMonitor == null) {
            recordingMonitor = createRecordingMonitor(activity);
        }
        if (recordingMonitor != null) {
            recordingMonitor.start();
        }

        startMediaObserver(activity);
        startDisplayMonitor(activity);
        attachFocusListener(activity);
    }

    private void stopMonitoring() {
        if (screenshotMonitor != null) {
            screenshotMonitor.stop();
            screenshotMonitor = null;
        }
        if (recordingMonitor != null) {
            recordingMonitor.stop();
            recordingMonitor = null;
        }
        stopMediaObserver();
        stopDisplayMonitor();
        removeFocusListener();
        monitoredActivity = null;
        mediaCheckQueued = false;
        lastFocusLostAt = 0;
        if (mainHandler != null) mainHandler.removeCallbacksAndMessages(null);
    }

    /** Returns null below API 34; the nested class is not loaded there. */
    private ScreenshotMonitor createScreenshotMonitor(Activity activity) {
        if (Build.VERSION.SDK_INT < 34) return null;
        return new Api34ScreenshotMonitor(this, activity);
    }

    /** Returns null below API 35; the nested class is not loaded there. */
    private RecordingMonitor createRecordingMonitor(Activity activity) {
        if (Build.VERSION.SDK_INT < 35) return null;
        return new Api35RecordingMonitor(this, activity);
    }

    private Handler handler() {
        if (mainHandler == null) mainHandler = new Handler(Looper.getMainLooper());
        return mainHandler;
    }

    private void notifyAttempt(String kind) {
        final long now = SystemClock.elapsedRealtime();
        final Long previous = lastAttemptAt.get(kind);
        if (previous != null && now - previous < ATTEMPT_DEDUPE_MS) return;
        lastAttemptAt.put(kind, now);

        JSObject payload = new JSObject();
        payload.put("kind", kind);
        payload.put("at", System.currentTimeMillis());
        notifyListeners("captureAttempt", payload);
    }

    private JSObject status(Activity activity) {
        JSObject result = new JSObject();
        result.put("platform", "android");
        result.put("sdk", Build.VERSION.SDK_INT);
        // The MediaStore and display observers work on every version, so the
        // native shell can always look for a capture attempt.
        result.put("screenshotDetection", true);
        result.put("screenRecordingDetection", true);

        boolean secure = false;
        if (activity != null) {
            secure =
                (activity.getWindow().getAttributes().flags
                    & WindowManager.LayoutParams.FLAG_SECURE) != 0;
        }
        result.put("secure", secure);
        return result;
    }

    /* ------------------------------------------------------------------ */
    /* MediaStore screenshot fallback                                      */
    /* ------------------------------------------------------------------ */

    private void startMediaObserver(Activity activity) {
        if (screenshotObserver != null) return;
        try {
            screenshotObserver = new ScreenshotObserver(this);
            activity.getContentResolver().registerContentObserver(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                true,
                screenshotObserver
            );
        } catch (Exception error) {
            screenshotObserver = null;
            Log.w(TAG, "MediaStore observer unavailable", error);
        }
    }

    private void stopMediaObserver() {
        if (screenshotObserver == null) return;
        try {
            getContext().getContentResolver().unregisterContentObserver(screenshotObserver);
        } catch (Exception ignored) {
            // The process or provider is already gone.
        }
        screenshotObserver = null;
    }

    private void onMediaStoreChanged() {
        if (!secureRequested || mediaCheckQueued) return;
        mediaCheckQueued = true;
        handler().postDelayed(() -> {
            mediaCheckQueued = false;
            checkRecentScreenshot();
        }, MEDIA_SETTLE_MS);
    }

    private void checkRecentScreenshot() {
        final Activity activity = getActivity();
        if (!secureRequested || !activityResumed || activity == null) return;

        final long since = (System.currentTimeMillis() - 20_000) / 1000;
        boolean namedScreenshot = false;
        boolean screenSizedImage = false;
        final boolean canRead = canReadScreenshots(activity);

        if (canRead) {
            Cursor cursor = null;
            try {
                final boolean modern = Build.VERSION.SDK_INT >= 29;
                final String[] projection = modern
                    ? new String[] {
                        MediaStore.Images.Media.DISPLAY_NAME,
                        MediaStore.Images.Media.DATE_ADDED,
                        MediaStore.Images.Media.RELATIVE_PATH,
                        MediaStore.Images.Media.WIDTH,
                        MediaStore.Images.Media.HEIGHT,
                    }
                    : new String[] {
                        MediaStore.Images.Media.DISPLAY_NAME,
                        MediaStore.Images.Media.DATE_ADDED,
                        MediaStore.Images.Media.DATA,
                        MediaStore.Images.Media.WIDTH,
                        MediaStore.Images.Media.HEIGHT,
                    };
                final String pathColumn = modern
                    ? MediaStore.Images.Media.RELATIVE_PATH
                    : MediaStore.Images.Media.DATA;

                cursor = activity.getContentResolver().query(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    projection,
                    MediaStore.Images.Media.DATE_ADDED + " >= ?",
                    new String[] { Long.toString(since) },
                    MediaStore.Images.Media.DATE_ADDED + " DESC"
                );

                if (cursor != null) {
                    final int nameIndex =
                        cursor.getColumnIndex(MediaStore.Images.Media.DISPLAY_NAME);
                    final int pathIndex = cursor.getColumnIndex(pathColumn);
                    final int widthIndex =
                        cursor.getColumnIndex(MediaStore.Images.Media.WIDTH);
                    final int heightIndex =
                        cursor.getColumnIndex(MediaStore.Images.Media.HEIGHT);

                    int checked = 0;
                    while (cursor.moveToNext() && checked < 8) {
                        checked += 1;
                        final String name =
                            nameIndex >= 0 ? cursor.getString(nameIndex) : null;
                        final String path =
                            pathIndex >= 0 ? cursor.getString(pathIndex) : null;
                        final int width =
                            widthIndex >= 0 ? cursor.getInt(widthIndex) : 0;
                        final int height =
                            heightIndex >= 0 ? cursor.getInt(heightIndex) : 0;

                        final String haystack =
                            ((name == null ? "" : name)
                                + " "
                                + (path == null ? "" : path))
                                .toLowerCase();
                        if (haystack.contains("screenshot")) {
                            namedScreenshot = true;
                            break;
                        }
                        if (looksLikeScreenSize(activity, width, height)) {
                            screenSizedImage = true;
                        }
                    }
                }
            } catch (Exception error) {
                // Photo access may be limited to selected items on Android 14+.
                Log.w(TAG, "Could not inspect the screenshot gallery", error);
            } finally {
                if (cursor != null) cursor.close();
            }
        }

        if (namedScreenshot) {
            lastFocusLostAt = 0;
            notifyAttempt("screenshot");
            return;
        }

        // Some OEMs use a localised or custom file name. A screen-sized image
        // saved while the screenshot overlay took focus is still a capture.
        // Without photo access the media change is the only signal available.
        final boolean focusMoved = focusMovedRecently();
        if (focusMoved && screenSizedImage) {
            lastFocusLostAt = 0;
            notifyAttempt("screenshot");
            return;
        }
        if (!canRead && focusMoved) {
            lastFocusLostAt = 0;
            notifyAttempt("screenshot");
        }
    }

    private boolean canReadScreenshots(Activity activity) {
        if (Build.VERSION.SDK_INT < 23) return true;
        final String permission = Build.VERSION.SDK_INT >= 33
            ? Manifest.permission.READ_MEDIA_IMAGES
            : Manifest.permission.READ_EXTERNAL_STORAGE;
        return activity.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    /** Screenshots match the display aspect ratio and cover most of it. */
    private boolean looksLikeScreenSize(Activity activity, int width, int height) {
        if (width <= 0 || height <= 0) return false;
        final DisplayMetrics metrics = new DisplayMetrics();
        activity.getWindowManager().getDefaultDisplay().getRealMetrics(metrics);
        if (metrics.widthPixels <= 0 || metrics.heightPixels <= 0) return false;

        final double imageRatio =
            (double) Math.max(width, height) / Math.max(1, Math.min(width, height));
        final double screenRatio =
            (double) Math.max(metrics.widthPixels, metrics.heightPixels)
                / Math.max(1, Math.min(metrics.widthPixels, metrics.heightPixels));

        return Math.abs(imageRatio - screenRatio) < 0.1
            && width >= metrics.widthPixels * 0.6
            && height >= metrics.heightPixels * 0.6;
    }

    /* ------------------------------------------------------------------ */
    /* Window focus and display observers                                  */
    /* ------------------------------------------------------------------ */

    private void attachFocusListener(Activity activity) {
        if (focusActivity == activity && focusListener != null) return;
        removeFocusListener();
        try {
            final View decor = activity.getWindow().getDecorView();
            focusObserver = decor.getViewTreeObserver();
            focusListener = hasFocus -> {
                if (!hasFocus) lastFocusLostAt = SystemClock.elapsedRealtime();
            };
            focusObserver.addOnWindowFocusChangeListener(focusListener);
            focusActivity = activity;
        } catch (Exception error) {
            focusObserver = null;
            focusListener = null;
            focusActivity = null;
        }
    }

    private void removeFocusListener() {
        try {
            if (focusObserver != null && focusListener != null && focusObserver.isAlive()) {
                focusObserver.removeOnWindowFocusChangeListener(focusListener);
            }
        } catch (Exception ignored) {
            // The view tree is already detached.
        }
        focusObserver = null;
        focusListener = null;
        focusActivity = null;
    }

    private boolean focusMovedRecently() {
        return lastFocusLostAt > 0
            && SystemClock.elapsedRealtime() - lastFocusLostAt < FOCUS_GRACE_MS;
    }

    private void startDisplayMonitor(Activity activity) {
        if (recordingDisplayMonitor != null) return;
        final DisplayManager manager =
            (DisplayManager) activity.getSystemService(Context.DISPLAY_SERVICE);
        if (manager == null) return;
        recordingDisplayMonitor = new RecordingDisplayMonitor(this, manager);
        recordingDisplayMonitor.start();
    }

    private void stopDisplayMonitor() {
        if (recordingDisplayMonitor != null) {
            recordingDisplayMonitor.stop();
            recordingDisplayMonitor = null;
        }
    }

    /** Contract that contains no version-specific Android types. */
    private interface ScreenshotMonitor {
        void start();
        void stop();
    }

    /** Contract that contains no version-specific Android types. */
    private interface RecordingMonitor {
        void start();
        void stop();
    }

    @TargetApi(34)
    private static final class Api34ScreenshotMonitor implements ScreenshotMonitor {
        private final HobymineSecurity plugin;
        private final Activity activity;
        private Activity.ScreenCaptureCallback callback;

        Api34ScreenshotMonitor(HobymineSecurity plugin, Activity activity) {
            this.plugin = plugin;
            this.activity = activity;
        }

        @Override
        public void start() {
            if (callback != null) return;
            callback = () -> plugin.notifyAttempt("screenshot");
            try {
                activity.registerScreenCaptureCallback(
                    activity.getMainExecutor(),
                    callback
                );
            } catch (Exception error) {
                // DETECT_SCREEN_CAPTURE may be unavailable on an OEM build.
                // Blocking still works; the MediaStore fallback covers alerts.
                callback = null;
                Log.w(TAG, "Screen capture callback unavailable", error);
            }
        }

        @Override
        public void stop() {
            if (callback == null) return;
            try {
                activity.unregisterScreenCaptureCallback(callback);
            } catch (Exception ignored) {
                // The activity may already be gone.
            }
            callback = null;
        }
    }

    @TargetApi(35)
    private static final class Api35RecordingMonitor implements RecordingMonitor {
        private final HobymineSecurity plugin;
        private final Activity activity;
        private Consumer<Integer> callback;
        private Integer lastState;

        Api35RecordingMonitor(HobymineSecurity plugin, Activity activity) {
            this.plugin = plugin;
            this.activity = activity;
        }

        @Override
        public void start() {
            if (callback != null) return;
            lastState = null;
            callback = state -> {
                if (state == null) return;
                final boolean visible =
                    state == WindowManager.SCREEN_RECORDING_STATE_VISIBLE;
                final boolean wasVisible =
                    lastState != null
                        && lastState == WindowManager.SCREEN_RECORDING_STATE_VISIBLE;
                lastState = state;
                // Only the transition into "being recorded" is an attempt. The
                // initial state is reported immediately, so a recording that was
                // already running when the chat opened still raises one alert.
                if (visible && !wasVisible) plugin.notifyAttempt("screen-recording");
            };

            try {
                activity.getWindowManager().addScreenRecordingCallback(
                    activity.getMainExecutor(),
                    callback
                );
            } catch (Exception error) {
                callback = null;
                Log.w(TAG, "Screen recording callback unavailable", error);
            }
        }

        @Override
        public void stop() {
            if (callback == null) return;
            try {
                activity.getWindowManager().removeScreenRecordingCallback(callback);
            } catch (Exception ignored) {
                // The activity may already be gone.
            }
            callback = null;
            lastState = null;
        }
    }

    /** MediaStore signal for screenshots saved by gestures and the power menu. */
    private static final class ScreenshotObserver extends ContentObserver {
        private final HobymineSecurity plugin;

        ScreenshotObserver(HobymineSecurity plugin) {
            super(new Handler(Looper.getMainLooper()));
            this.plugin = plugin;
        }

        @Override
        public void onChange(boolean selfChange, Uri uri) {
            super.onChange(selfChange, uri);
            plugin.onMediaStoreChanged();
        }

        @Override
        public void onChange(boolean selfChange) {
            onChange(selfChange, null);
        }
    }

    /** Virtual displays are created by MediaProjection recorders and casters. */
    private static final class RecordingDisplayMonitor
        implements DisplayManager.DisplayListener {

        private final HobymineSecurity plugin;
        private final DisplayManager manager;
        private boolean started = false;

        RecordingDisplayMonitor(HobymineSecurity plugin, DisplayManager manager) {
            this.plugin = plugin;
            this.manager = manager;
        }

        void start() {
            if (started) return;
            manager.registerDisplayListener(this, new Handler(Looper.getMainLooper()));
            started = true;
            // A recorder that was already running before the chat opened.
            for (Display display : manager.getDisplays()) {
                if (isCaptureDisplay(display)) {
                    plugin.notifyAttempt("screen-recording");
                    break;
                }
            }
        }

        void stop() {
            if (!started) return;
            try {
                manager.unregisterDisplayListener(this);
            } catch (Exception ignored) {
                // The system service is already gone.
            }
            started = false;
        }

        @Override
        public void onDisplayAdded(int displayId) {
            final Display display = manager.getDisplay(displayId);
            if (isCaptureDisplay(display)) plugin.notifyAttempt("screen-recording");
        }

        @Override
        public void onDisplayRemoved(int displayId) {}

        @Override
        public void onDisplayChanged(int displayId) {}

        /**
         * Screen recorders and casters capture through a virtual display that
         * MediaProjection publishes to {@link DisplayManager} under a
         * recognisable name ("MediaProjection", "ScreenRecord", "Cast", ...).
         * {@code Display.getType()} is a hidden API, so classification uses the
         * name and the fact that the display is not the built-in screen.
         */
        private static boolean isCaptureDisplay(Display display) {
            if (display == null || display.getDisplayId() == Display.DEFAULT_DISPLAY) {
                return false;
            }
            final String name = display.getName();
            if (name == null) return false;
            final String lower = name.toLowerCase(Locale.US);
            return lower.contains("mediaprojection")
                || lower.contains("media projection")
                || lower.contains("screenrecord")
                || lower.contains("screen record")
                || lower.contains("screencast")
                || lower.contains("screen cast")
                || lower.contains("virtual display")
                || lower.contains("cast");
        }
    }
}
