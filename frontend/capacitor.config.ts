/**
 * Capacitor configuration — wraps the web build (`dist/`) as Android and iOS
 * apps. White-label builds per institute override `appId` / `appName` (see
 * docs/PLATFORMS.md). Native projects are generated with `npx cap add android|ios`.
 */
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: process.env.CAP_APP_ID ?? 'app.edutrack.tuition',
  appName: process.env.CAP_APP_NAME ?? 'EduTrack',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'always',
  },
};

export default config;
