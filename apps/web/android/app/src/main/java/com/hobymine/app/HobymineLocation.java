package com.hobymine.app;

import android.Manifest;
import android.content.Context;
import android.location.Address;
import android.location.Geocoder;
import android.location.Location;
import android.location.LocationManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.List;
import java.util.Locale;

/**
 * GPS support for the discovery filters.
 *
 * <p>Requests the Android runtime location permission and exposes the last
 * known position plus a reverse geocode (city and country) so the app can offer
 * "people near me" discovery.
 */
@CapacitorPlugin(
    name = "HobymineLocation",
    permissions = {
        @Permission(
            alias = "location",
            strings = {
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            }
        )
    }
)
public class HobymineLocation extends Plugin {

    @PluginMethod
    public void requestPermission(PluginCall call) {
        PermissionState state = getPermissionState("location");
        if (state == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("location", call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState("location") == PermissionState.GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void getLastKnownPosition(PluginCall call) {
        JSObject result = new JSObject();
        if (getPermissionState("location") != PermissionState.GRANTED) {
            result.put("granted", false);
            result.put("latitude", 0);
            result.put("longitude", 0);
            call.resolve(result);
            return;
        }

        LocationManager manager = (LocationManager) getContext()
            .getSystemService(Context.LOCATION_SERVICE);
        Location best = null;
        if (manager != null) {
            String[] providers = new String[] {
                LocationManager.GPS_PROVIDER,
                LocationManager.NETWORK_PROVIDER,
                LocationManager.PASSIVE_PROVIDER
            };
            for (String provider : providers) {
                try {
                    Location candidate = manager.getLastKnownLocation(provider);
                    if (candidate != null && (best == null || candidate.getTime() > best.getTime())) {
                        best = candidate;
                    }
                } catch (SecurityException ignored) {
                    // The provider is not available on this device.
                } catch (IllegalArgumentException ignored) {
                    // Unknown provider.
                }
            }
        }

        result.put("granted", true);
        if (best != null) {
            result.put("latitude", best.getLatitude());
            result.put("longitude", best.getLongitude());
            result.put("accuracy", best.getAccuracy());
        } else {
            result.put("latitude", 0);
            result.put("longitude", 0);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void reverseGeocode(PluginCall call) {
        Double latitude = call.getDouble("latitude");
        Double longitude = call.getDouble("longitude");
        if (latitude == null || longitude == null) {
            call.reject("latitude and longitude are required");
            return;
        }

        JSObject result = new JSObject();
        result.put("city", "");
        result.put("countryName", "");
        result.put("countryCode", "");

        try {
            Geocoder geocoder = new Geocoder(getContext(), Locale.getDefault());
            List<Address> addresses = geocoder.getFromLocation(latitude, longitude, 1);
            if (addresses != null && !addresses.isEmpty()) {
                Address address = addresses.get(0);
                String city = address.getLocality() != null ? address.getLocality() : "";
                if (city.isEmpty() && address.getSubAdminArea() != null) {
                    city = address.getSubAdminArea();
                }
                result.put("city", city);
                result.put("countryName", address.getCountryName() != null ? address.getCountryName() : "");
                result.put("countryCode", address.getCountryCode() != null ? address.getCountryCode() : "");
            }
        } catch (Exception ignored) {
            // Geocoding is best effort — the country can still be derived from
            // the shared country dataset on the web side.
        }
        call.resolve(result);
    }
}
