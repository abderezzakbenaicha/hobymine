package com.hobymine.app;

import android.Manifest;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Requests the Android runtime permissions the WebView needs for the
 * microphone, the camera and the photo library. The web app calls this before
 * recording a voice note or starting a 1-on-1 call so the user gets a clear
 * system prompt instead of a silent failure.
 */
@CapacitorPlugin(
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }),
        @Permission(alias = "photos", strings = { Manifest.permission.READ_MEDIA_IMAGES }),
        @Permission(alias = "photosLegacy", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
    }
)
public class HobyminePermissions extends Plugin {

    @PluginMethod
    public void check(PluginCall call) {
        String alias = resolveAlias(call.getString("permission", "microphone"));
        PermissionState state = getPermissionState(alias);
        JSObject result = new JSObject();
        result.put("granted", state == PermissionState.GRANTED);
        result.put("state", state.name());
        call.resolve(result);
    }

    @PluginMethod
    public void request(PluginCall call) {
        String alias = resolveAlias(call.getString("permission", "microphone"));
        PermissionState state = getPermissionState(alias);
        if (state == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias(alias, call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        String alias = resolveAlias(call.getString("permission", "microphone"));
        JSObject result = new JSObject();
        result.put("granted", getPermissionState(alias) == PermissionState.GRANTED);
        call.resolve(result);
    }

    private String resolveAlias(String permission) {
        if ("camera".equals(permission)) {
            return "camera";
        }
        if ("photos".equals(permission)) {
            // READ_MEDIA_IMAGES only exists from Android 13 onwards.
            return Build.VERSION.SDK_INT >= 33 ? "photos" : "photosLegacy";
        }
        return "microphone";
    }
}
