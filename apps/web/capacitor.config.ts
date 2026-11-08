import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hobymine.app',
  appName: 'HobyMine',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    // The local demo API is served over plain HTTP on the LAN.
    allowMixedContent: true,
  },
};

export default config;
