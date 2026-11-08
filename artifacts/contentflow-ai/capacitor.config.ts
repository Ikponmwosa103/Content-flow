import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.contentflow.ai',
  appName: 'ContentFlow AI',
  webDir: 'dist/public',
  server: {
    // Load the live production frontend; API, auth, Gemini and database stay online.
    url: 'https://content-flow.jaywebdeveloper3.workers.dev',
    cleartext: false,
    androidScheme: 'https',
  },
  android: { allowMixedContent: false },
};

export default config;
