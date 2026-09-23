/**
 * Runtime platform detection. The same bundle runs as a website/PWA, inside
 * Capacitor (Android/iOS) and inside Tauri (Windows/macOS/Linux).
 */
declare global {
  interface Window {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
    __TAURI_INTERNALS__?: unknown;
  }
}

export type Platform = 'web' | 'android' | 'ios' | 'desktop';

export function getPlatform(): Platform {
  if (typeof window === 'undefined') return 'web';
  if (window.__TAURI_INTERNALS__) return 'desktop';
  const cap = window.Capacitor;
  if (cap?.isNativePlatform?.()) return cap.getPlatform?.() === 'ios' ? 'ios' : 'android';
  return 'web';
}

/** Native shells serve from a custom origin, where hash routing is the safe choice. */
export function isNativeShell(): boolean {
  return getPlatform() !== 'web';
}
