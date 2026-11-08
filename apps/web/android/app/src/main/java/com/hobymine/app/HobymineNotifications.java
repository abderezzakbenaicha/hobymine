package com.hobymine.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Local notifications for incoming messages, likes and matches.
 *
 * <p>The web layer decides when to notify (a message that arrives while the
 * app is in the background) and this plugin posts it through Android's
 * notification manager, with a tap that reopens the app on the right chat.
 */
@CapacitorPlugin(
    name = "HobymineNotifications",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class HobymineNotifications extends Plugin {

    public static final String PREFS = "hobymine_notifications";
    public static final String PREF_TOKEN = "token";
    public static final String PREF_API_BASE = "apiBase";
    public static final String PREF_VISIBLE = "visible";

    public static final String CHANNEL_MESSAGES = "hobymine_messages";
    public static final String CHANNEL_ACTIVITY = "hobymine_activity";

    private MediaPlayer ringtonePlayer;
    private Vibrator ringtoneVibrator;

    @Override
    public void load() {
        super.load();
        createChannels();
    }

    @Override
    protected void handleOnDestroy() {
        stopRingtoneInternal();
        super.handleOnDestroy();
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getContext().getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel messages = new NotificationChannel(
            CHANNEL_MESSAGES,
            "Messages",
            NotificationManager.IMPORTANCE_HIGH
        );
        messages.setDescription("New chat messages from your matches");
        messages.enableVibration(true);
        NotificationChannel activity = new NotificationChannel(
            CHANNEL_ACTIVITY,
            "Likes and matches",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        activity.setDescription("New likes, super likes and matches");
        manager.createNotificationChannel(messages);
        manager.createNotificationChannel(activity);
    }

    /** Stores the session so the background service can reach the API. */
    @PluginMethod
    public void saveSession(PluginCall call) {
        String token = call.getString("token", "");
        String apiBase = call.getString("apiBase", "");
        getContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_TOKEN, token)
            .putString(PREF_API_BASE, apiBase)
            .apply();
        call.resolve();
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        call.resolve();
    }

    /** Lets the background service know whether the app is on screen. */
    @PluginMethod
    public void setAppVisible(PluginCall call) {
        boolean visible = Boolean.TRUE.equals(call.getBoolean("visible", false));
        getContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_VISIBLE, visible ? "1" : "0")
            .apply();
        call.resolve();
    }

    @PluginMethod
    public void startBackgroundService(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(context, HobymineBackgroundService.class);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception error) {
            // Foreground services can be refused on restricted devices.
        }
        call.resolve();
    }

    @PluginMethod
    public void stopBackgroundService(PluginCall call) {
        Context context = getContext();
        try {
            context.stopService(new Intent(context, HobymineBackgroundService.class));
        } catch (Exception ignored) {
            // The service was not running.
        }
        call.resolve();
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        PermissionState state = getPermissionState("notifications");
        if (state == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("notifications", call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void show(PluginCall call) {
        String title = call.getString("title", "HobyMine");
        String body = call.getString("body", "");
        String channelId = call.getString("channelId", CHANNEL_MESSAGES);
        String matchId = call.getString("matchId", "");
        int notificationId = call.getInt("id", 0);
        if (notificationId == 0) {
            notificationId = (int) (System.currentTimeMillis() % Integer.MAX_VALUE);
        }

        Intent intent = new Intent(getContext(), MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (!matchId.isEmpty()) intent.putExtra("matchId", matchId);
        intent.putExtra("title", title);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingIntent = PendingIntent.getActivity(getContext(), notificationId, intent, flags);

        Notification notification = new NotificationCompat.Builder(getContext(), channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setLargeIcon(largeIcon())
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build();

        try {
            NotificationManagerCompat manager = NotificationManagerCompat.from(getContext());
            manager.notify(notificationId, notification);
        } catch (SecurityException ignored) {
            // The permission was revoked between the request and the call.
        }
        call.resolve();
    }

    /**
     * Plays the device's real ringtone (looped) and starts the incoming-call
     * vibration pattern. Called by the web layer when a voice call arrives.
     */
    @PluginMethod
    public void startRingtone(PluginCall call) {
        stopRingtoneInternal();
        try {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (uri == null) {
                uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            }
            if (uri == null) {
                call.reject("No ringtone is configured on this device");
                return;
            }

            MediaPlayer player = new MediaPlayer();
            player.setDataSource(getContext(), uri);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                player.setAudioAttributes(
                    new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                );
            } else {
                player.setAudioStreamType(AudioManager.STREAM_RING);
            }
            player.setLooping(true);
            player.prepare();
            player.start();
            ringtonePlayer = player;
            startVibration();
            call.resolve();
        } catch (Exception error) {
            stopRingtoneInternal();
            call.reject("Could not play the device ringtone");
        }
    }

    /** Stops the incoming-call ringtone and vibration. */
    @PluginMethod
    public void stopRingtone(PluginCall call) {
        stopRingtoneInternal();
        call.resolve();
    }

    private void startVibration() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager manager =
                    (VibratorManager) getContext().getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                ringtoneVibrator = manager != null ? manager.getDefaultVibrator() : null;
            } else {
                ringtoneVibrator =
                    (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (ringtoneVibrator == null || !ringtoneVibrator.hasVibrator()) return;
            long[] pattern = new long[] { 0, 700, 700, 700, 1400 };
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ringtoneVibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
            } else {
                ringtoneVibrator.vibrate(pattern, 0);
            }
        } catch (SecurityException ignored) {
            // Vibration is optional; the ringtone still plays.
        }
    }

    private void stopRingtoneInternal() {
        if (ringtonePlayer != null) {
            try {
                if (ringtonePlayer.isPlaying()) ringtonePlayer.stop();
            } catch (IllegalStateException ignored) {
                // The player was already released.
            }
            ringtonePlayer.release();
            ringtonePlayer = null;
        }
        if (ringtoneVibrator != null) {
            ringtoneVibrator.cancel();
            ringtoneVibrator = null;
        }
    }

    /** The HobyMine logo, used as the large notification icon. */
    private android.graphics.Bitmap largeIcon() {
        return android.graphics.BitmapFactory.decodeResource(
            getContext().getResources(),
            R.mipmap.ic_launcher
        );
    }

    /** The payload of the notification that started (or resumed) the app. */
    @PluginMethod
    public void getLaunchPayload(PluginCall call) {
        JSObject result = new JSObject();
        if (getActivity() != null) {
            Intent intent = getActivity().getIntent();
            if (intent != null) {
                String matchId = intent.getStringExtra("matchId");
                if (matchId != null) result.put("matchId", matchId);
                String title = intent.getStringExtra("title");
                if (title != null) result.put("title", title);
            }
        }
        call.resolve(result);
    }

    @PluginMethod
    public void clearLaunchPayload(PluginCall call) {
        if (getActivity() != null) {
            Intent intent = getActivity().getIntent();
            if (intent != null) intent.removeExtra("matchId");
        }
        call.resolve();
    }
}
