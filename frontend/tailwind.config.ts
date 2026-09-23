/**
 * Tailwind configuration — EduTrack design system.
 *
 * Every colour is a CSS variable (RGB channels) declared in src/styles/index.css.
 * That lets a tenant (institute) re-brand the app at runtime by swapping
 * `data-brand` on <html>, without rebuilding. Token names mirror DESIGN.md
 * (Material 3 style roles) so markup from the design files ports 1:1.
 */
import type { Config } from 'tailwindcss';

/** Build a colour that supports Tailwind opacity modifiers, e.g. `bg-primary/20`. */
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const colorRoles = [
  'primary', 'on-primary', 'primary-container', 'on-primary-container',
  'primary-fixed', 'primary-fixed-dim', 'on-primary-fixed', 'on-primary-fixed-variant',
  'inverse-primary', 'surface-tint',
  'secondary', 'on-secondary', 'secondary-container', 'on-secondary-container',
  'secondary-fixed', 'secondary-fixed-dim', 'on-secondary-fixed', 'on-secondary-fixed-variant',
  'tertiary', 'on-tertiary', 'tertiary-container', 'on-tertiary-container',
  'tertiary-fixed', 'tertiary-fixed-dim', 'on-tertiary-fixed', 'on-tertiary-fixed-variant',
  'error', 'on-error', 'error-container', 'on-error-container',
  'surface', 'surface-dim', 'surface-bright', 'surface-variant',
  'surface-container-lowest', 'surface-container-low', 'surface-container',
  'surface-container-high', 'surface-container-highest',
  'on-surface', 'on-surface-variant', 'inverse-surface', 'inverse-on-surface',
  'outline', 'outline-variant', 'background', 'on-background',
  // Functional status colours (DESIGN.md › Functional Status Indicators)
  'success', 'success-container', 'on-success-container',
  'warning', 'warning-container', 'on-warning-container',
  'danger', 'danger-container', 'on-danger-container',
  'neutral-container', 'on-neutral-container',
] as const;

const font = ['"Plus Jakarta Sans Variable"', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'];

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: Object.fromEntries(colorRoles.map((r) => [r, v(r)])),
      fontFamily: {
        sans: font,
        'headline-xl': font, 'headline-xl-mobile': font, 'headline-lg': font,
        'headline-lg-mobile': font, 'headline-md': font, 'headline-sm': font,
        'title-lg': font, 'title-md': font,
        'body-lg': font, 'body-md': font, 'body-sm': font,
        'label-lg': font, 'label-md': font, 'label-sm': font,
      },
      fontSize: {
        'headline-xl': ['36px', { lineHeight: '44px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-xl-mobile': ['28px', { lineHeight: '36px', letterSpacing: '-0.015em', fontWeight: '700' }],
        'headline-lg': ['30px', { lineHeight: '38px', letterSpacing: '-0.015em', fontWeight: '700' }],
        'headline-lg-mobile': ['24px', { lineHeight: '32px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'headline-md': ['24px', { lineHeight: '32px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'headline-sm': ['20px', { lineHeight: '28px', letterSpacing: '-0.005em', fontWeight: '600' }],
        'title-lg': ['18px', { lineHeight: '26px', fontWeight: '600' }],
        'title-md': ['16px', { lineHeight: '24px', fontWeight: '600' }],
        'body-lg': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body-md': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'body-sm': ['12px', { lineHeight: '16px', fontWeight: '400' }],
        'label-lg': ['14px', { lineHeight: '20px', letterSpacing: '0.01em', fontWeight: '600' }],
        'label-md': ['12px', { lineHeight: '16px', letterSpacing: '0.02em', fontWeight: '600' }],
        'label-sm': ['11px', { lineHeight: '14px', letterSpacing: '0.03em', fontWeight: '700' }],
      },
      spacing: {
        'space-2xs': '0.25rem',
        'space-xs': '0.5rem',
        'space-sm': '0.75rem',
        'space-md': '1rem',
        'space-lg': '1.5rem',
        'space-xl': '2rem',
        'space-2xl': '3rem',
        gutter: '1.5rem',
        'gutter-mobile': '1rem',
        margin: '2rem',
        'margin-mobile': '1rem',
        sidebar: '16rem',
        rail: '4.5rem',
        // Safe-area insets for notched phones (Capacitor / PWA standalone)
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        full: '9999px',
      },
      boxShadow: {
        // DESIGN.md › Elevation & Depth
        'level-1': '0px 1px 3px rgba(15, 23, 42, 0.05), 0px 1px 2px rgba(15, 23, 42, 0.03)',
        'level-2': '0px 8px 16px -4px rgba(15, 23, 42, 0.08), 0px 4px 6px -2px rgba(15, 23, 42, 0.04)',
        'level-3': '0px 20px 25px -5px rgba(15, 23, 42, 0.12), 0px 10px 10px -5px rgba(15, 23, 42, 0.04)',
        bar: '0 1px 8px rgba(0, 0, 0, 0.04)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        'slide-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        'slide-in-left': { from: { transform: 'translateX(-100%)' }, to: { transform: 'none' } },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
        'slide-in-right': 'slide-in-right 220ms ease-out',
        'slide-in-left': 'slide-in-left 220ms ease-out',
      },
    },
  },
  plugins: [],
} satisfies Config;
