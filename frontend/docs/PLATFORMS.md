# Shipping EduTrack to web, mobile and desktop

One build (`npm run build` → `dist/`) is packaged three ways. Nothing in `src/`
is platform-specific except `src/lib/platform.ts` (detection) and the router,
which switches to hash URLs inside native shells.

## 1. Web / PWA

```bash
npm ci
npm run build          # type-checks, then writes dist/
```

Serve `dist/` from any static host or CDN (Netlify, Vercel, S3 + CloudFront,
Nginx). Configure the host to fall back to `index.html` for unknown paths
(SPA routing). The app ships a web manifest (`public/manifest.webmanifest`)
so it can be installed from the browser.

Per-tenant subdomains (`apex.edutrack.app`) point at the same build; the tenant
is resolved at login by institute code (and later by subdomain, on the backend).

## 2. Android & iOS (Capacitor)

Prerequisites: Android Studio + JDK 17 (Android), Xcode 15+ on macOS (iOS).

```bash
npm run build
npx cap add android        # first time only — generates android/
npx cap add ios            # first time only, macOS — generates ios/
npx cap sync               # copy dist/ + plugins into the native projects
npx cap open android       # build / run / sign in Android Studio
npx cap open ios           # build / run / sign in Xcode
```

- App id/name come from `capacitor.config.ts`. For a white-label build for one
  institute: `CAP_APP_ID=in.apexacademy.app CAP_APP_NAME="Apex Academy" npx cap sync`,
  then replace the icons/splash in the native projects.
- Recommended plugins when features need them: `@capacitor/push-notifications`
  (absence/fee alerts), `@capacitor/camera` (student photos),
  `@capacitor/filesystem` + `@capacitor/share` (receipts/exports),
  `@capacitor/preferences` (secure-ish storage instead of localStorage).
- Safe areas: the UI already pads for notches (`env(safe-area-inset-*)`).

## 3. Windows / macOS / Linux (Tauri)

Prerequisites: Rust toolchain (`rustup`), plus the platform build tools
(Visual Studio C++ Build Tools + WebView2 on Windows).

```bash
npm install -D @tauri-apps/cli@2
npx tauri init --ci --app-name "EduTrack" --window-title "EduTrack" \
  --frontend-dist ../dist --dev-url http://localhost:5173 \
  --before-dev-command "npm run dev" --before-build-command "npm run build"
npx tauri dev              # desktop window against the dev server
npx tauri build            # signed installers (.msi / .dmg / .AppImage / .deb)
```

Enable the Tauri updater plugin for auto-updates and sign release builds.

## Environment

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend base URL. Unset = local demo data (no backend). |
| `VITE_APP_VERSION` | Shown in diagnostics / crash reports. |
| `CAP_APP_ID`, `CAP_APP_NAME` | White-label mobile builds. |
