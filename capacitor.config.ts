import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.neust.seecareer',
  appName: 'SeeCareer',
  webDir: 'www',
  server: {
    androidScheme: 'https',
    // The free AI gateway is plain http, so Android must allow cleartext traffic.
    cleartext: true,
  },
  plugins: {
    // Sends HTTP calls through the native layer (no CORS / mixed-content problems on the phone).
    CapacitorHttp: { enabled: true },
  },
};

export default config;
