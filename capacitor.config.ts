import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.neust.seecareer',
  appName: 'SeeCareer',
  webDir: 'www',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    // Sends HTTP calls through the native layer (no CORS / mixed-content problems on the phone).
    CapacitorHttp: { enabled: true },
  },
};

export default config;
