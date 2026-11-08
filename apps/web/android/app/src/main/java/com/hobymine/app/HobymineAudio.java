package com.hobymine.app;

import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Controls the audio route for 1-on-1 voice calls.
 *
 * <p>WebRTC inside a WebView can leave the phone on the loudspeaker. This plugin
 * switches Android into communication mode and explicitly selects either the
 * built-in earpiece or the loudspeaker. The previous mode is restored when the
 * call ends so media playback is not left on the call route.
 */
@CapacitorPlugin(name = "HobymineAudio")
public class HobymineAudio extends Plugin {

    private boolean routeSaved = false;
    private int previousMode = AudioManager.MODE_NORMAL;
    private boolean previousSpeakerphone = false;

    @PluginMethod
    public void setAudioRoute(PluginCall call) {
        AudioManager manager =
            (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (manager == null) {
            call.reject("Audio routing is not available on this device");
            return;
        }

        Boolean requested = call.getBoolean("speaker", false);
        boolean speaker = requested != null && requested;

        if (!routeSaved) {
            previousMode = manager.getMode();
            previousSpeakerphone = manager.isSpeakerphoneOn();
            routeSaved = true;
        }

        try {
            manager.setMode(AudioManager.MODE_IN_COMMUNICATION);
            boolean applied = false;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                AudioDeviceInfo desired = findCommunicationDevice(
                    manager,
                    speaker
                        ? AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                        : AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
                );
                if (desired != null) {
                    applied = manager.setCommunicationDevice(desired);
                }
            }

            if (!applied) {
                manager.setSpeakerphoneOn(speaker);
            }
            call.resolve();
        } catch (RuntimeException error) {
            call.reject("Could not change the call audio route");
        }
    }

    @PluginMethod
    public void resetAudioRoute(PluginCall call) {
        resetAudioRouteInternal();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        resetAudioRouteInternal();
        super.handleOnDestroy();
    }

    private AudioDeviceInfo findCommunicationDevice(AudioManager manager, int type) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return null;
        for (AudioDeviceInfo device : manager.getAvailableCommunicationDevices()) {
            if (device.getType() == type) return device;
        }
        return null;
    }

    private void resetAudioRouteInternal() {
        if (!routeSaved) return;
        AudioManager manager =
            (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (manager != null) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    manager.clearCommunicationDevice();
                }
                manager.setSpeakerphoneOn(previousSpeakerphone);
                manager.setMode(previousMode);
            } catch (RuntimeException ignored) {
                // The audio service may already be tearing down with the app.
            }
        }
        routeSaved = false;
    }
}
