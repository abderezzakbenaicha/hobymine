package com.hobymine.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Keeps HobyMine alive in the background so messages, likes and matches still
 * raise a notification when the app has been closed.
 *
 * <p>Android has no background socket for a plain WebView app, so the service
 * polls the API on a short interval and compares the unread counters with the
 * previous poll. It only runs while the member has background alerts switched
 * on, and it stays quiet while the app itself is in the foreground (the socket
 * already handles those events).
 */
public class HobymineBackgroundService extends android.app.Service {

    private static final String TAG = "HobymineBackground";
    private static final String CHANNEL_ID = "hobymine_service";
    private static final long POLL_INTERVAL_MS = 20_000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private int lastUnread = -1;
    private int lastLikes = -1;
    private int lastViews = -1;
    private boolean running = false;

    private final Runnable poll = new Runnable() {
        @Override
        public void run() {
            if (!running) return;
            checkForUpdates();
            handler.postDelayed(this, POLL_INTERVAL_MS);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        running = true;
        startForeground(1, buildServiceNotification());
        handler.removeCallbacks(poll);
        handler.post(poll);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        handler.removeCallbacks(poll);
        super.onDestroy();
    }

    @Override
    public android.os.IBinder onBind(Intent intent) {
        return null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Background alerts",
            NotificationManager.IMPORTANCE_MIN
        );
        channel.setDescription("Keeps HobyMine connected so you are alerted right away");
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private Notification buildServiceNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("HobyMine is active")
            .setContentText("Watching for new messages and likes")
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setOngoing(true)
            .setShowWhen(false)
            .build();
    }

    private String pref(String key) {
        return getSharedPreferences(HobymineNotifications.PREFS, Context.MODE_PRIVATE)
            .getString(key, "");
    }

    private void checkForUpdates() {
        String token = pref(HobymineNotifications.PREF_TOKEN);
        String apiBase = pref(HobymineNotifications.PREF_API_BASE);
        if (token == null || token.isEmpty() || apiBase == null || apiBase.isEmpty()) return;
        // The app is in the foreground: the socket already shows the alerts.
        if (pref(HobymineNotifications.PREF_VISIBLE).equals("1")) return;

        try {
            HttpURLConnection connection = (HttpURLConnection) new URL(
                apiBase + "/api/matches"
            ).openConnection();
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Authorization", "Bearer " + token);
            connection.setConnectTimeout(6000);
            connection.setReadTimeout(6000);

            String body;
            try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8)
            )) {
                StringBuilder builder = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) builder.append(line);
                body = builder.toString();
            }
            connection.disconnect();

            JSONObject payload = new JSONObject(body);
            JSONArray matches = payload.optJSONArray("matches");
            int unread = 0;
            String sender = "";
            String preview = "";
            String matchId = "";
            boolean captureBlocked = false;
            if (matches != null) {
                for (int i = 0; i < matches.length(); i += 1) {
                    JSONObject match = matches.optJSONObject(i);
                    if (match == null) continue;
                    int count = match.optInt("unreadCount", 0);
                    unread += count;
                    if (count > 0 && sender.isEmpty()) {
                        JSONObject person = match.optJSONObject("user");
                        if (person != null) sender = person.optString("name", "Someone");
                        matchId = match.optString("id", "");
                        JSONObject last = match.optJSONObject("lastMessage");
                        if (last != null) {
                            String kind = last.optString("kind", "text");
                            String messageBody = last.optString("body", "");
                            if ("system".equals(kind)) {
                                // A blocked screenshot or screen recording is the
                                // most urgent notice: make it explicit in the tray.
                                String lower = messageBody.toLowerCase(java.util.Locale.ROOT);
                                if (lower.contains("recording")) {
                                    preview = "tried to record the screen";
                                    captureBlocked = true;
                                } else if (lower.contains("screenshot")) {
                                    preview = "tried to take a screenshot";
                                    captureBlocked = true;
                                } else {
                                    preview = messageBody;
                                }
                            } else if ("image".equals(kind)) {
                                preview = "📷 Sent you a photo";
                            } else if ("voice".equals(kind)) {
                                preview = "🎙️ Sent you a voice note";
                            } else {
                                preview = messageBody;
                            }
                        }
                    }
                }
            }
            int likes = payload.optInt("likesYouCount", 0);
            int views = fetchViewCount(token, apiBase);

            if (lastUnread >= 0 && unread > lastUnread && !sender.isEmpty()) {
                showMessageNotification(sender, preview, matchId, captureBlocked);
            }
            if (lastLikes >= 0 && likes > lastLikes) {
                showActivityNotification(
                    1002,
                    "Someone new likes you 💚",
                    "Open HobyMine to see who they are."
                );
            }
            if (lastViews >= 0 && views > lastViews) {
                showActivityNotification(
                    1003,
                    "Someone viewed your profile 👀",
                    "Open HobyMine to see who stopped by."
                );
            }

            lastUnread = unread;
            lastLikes = likes;
            if (views >= 0) lastViews = views;
        } catch (Exception error) {
            Log.d(TAG, "poll failed: " + error.getMessage());
        }
    }

    /** Reads the profile-view counter so the service can alert in the background. */
    private int fetchViewCount(String token, String apiBase) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(
                apiBase + "/api/me/viewers"
            ).openConnection();
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Authorization", "Bearer " + token);
            connection.setConnectTimeout(6000);
            connection.setReadTimeout(6000);

            try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8)
            )) {
                StringBuilder builder = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) builder.append(line);
                return new JSONObject(builder.toString()).optInt("count", -1);
            }
        } catch (Exception error) {
            Log.d(TAG, "profile view poll failed: " + error.getMessage());
            return -1;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void showMessageNotification(
        String name,
        String preview,
        String matchId,
        boolean captureBlocked
    ) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (matchId != null && !matchId.isEmpty()) intent.putExtra("matchId", matchId);
        intent.putExtra("title", captureBlocked ? "Capture blocked" : name);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 404, intent, flags);

        String title = captureBlocked ? "Capture blocked" : name;
        String text = captureBlocked
            ? name + " " + preview + ". HobyMine blocked it."
            : (preview.isEmpty() ? "New message" : preview);

        Notification notification = new NotificationCompat.Builder(this, HobymineNotifications.CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_notification)
            .setLargeIcon(iconBitmap())
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build();
        post(1001, notification);
    }

    private void showActivityNotification(int id, String title, String body) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 405, intent, flags);

        Notification notification = new NotificationCompat.Builder(this, HobymineNotifications.CHANNEL_ACTIVITY)
            .setSmallIcon(R.drawable.ic_notification)
            .setLargeIcon(iconBitmap())
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_SOCIAL)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build();
        post(id, notification);
    }

    private android.graphics.Bitmap iconBitmap() {
        android.graphics.Bitmap bitmap = android.graphics.BitmapFactory.decodeResource(
            getResources(),
            R.mipmap.ic_launcher
        );
        return bitmap;
    }

    private void post(int id, Notification notification) {
        try {
            NotificationManagerCompat manager = NotificationManagerCompat.from(this);
            manager.notify(id, notification);
        } catch (SecurityException ignored) {
            // The notification permission was revoked.
        }
    }
}
