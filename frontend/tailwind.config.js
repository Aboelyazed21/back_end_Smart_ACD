/**
 * Design tokens.
 *
 * Every palette below is driven by CSS custom properties declared in
 * `src/index.css` (`:root` = light, `[data-theme='dark']` = dark) so the whole
 * UI re-themes by swapping the variables — no class changes required.
 * `rgb(var(--x) / <alpha-value>)` keeps Tailwind opacity modifiers working.
 */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** Tones that must flip between themes (tints + text). The rest stay literal. */
const FLIPPABLE = new Set([50, 100, 200, 700, 800, 900, 950]);

/** Build a Tailwind colour scale where selected tones come from CSS vars. */
function scale(name, palette) {
  return Object.fromEntries(
    Object.entries(palette).map(([tone, hex]) => [
      tone,
      FLIPPABLE.has(Number(tone)) ? v(`${name}-${tone}`) : hex,
    ]),
  );
}

// Tailwind stock palettes (only the tones the app actually uses are themed).
const RED = {
  50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171',
  500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 800: '#991b1b', 900: '#7f1d1d',
  950: '#450a0a',
};
const EMERALD = {
  50: '#ecfdf5', 100: '#d1fae5', 200: '#a7f3d0', 300: '#6ee7b7', 400: '#34d399',
  500: '#10b981', 600: '#059669', 700: '#047857', 800: '#065f46', 900: '#064e3b',
  950: '#022c22',
};
const AMBER = {
  50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24',
  500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f',
  950: '#451a03',
};
const SKY = {
  50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd', 300: '#7dd3fc', 400: '#38bdf8',
  500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1', 800: '#075985', 900: '#0c4a6e',
  950: '#082f49',
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Neutrals: page canvas, surfaces, hairlines, text.
        ink: {
          50: v('ink-50'),
          100: v('ink-100'),
          200: v('ink-200'),
          300: v('ink-300'),
          400: v('ink-400'),
          500: v('ink-500'),
          600: v('ink-600'),
          700: v('ink-700'),
          800: v('ink-800'),
          900: v('ink-900'),
          950: v('ink-950'),
        },
        // Brand blue (BUA LMS): tints, borders, labels and the primary action.
        brand: {
          50: v('brand-50'),
          100: v('brand-100'),
          200: v('brand-200'),
          300: v('brand-300'),
          400: v('brand-400'),
          500: v('brand-500'),
          600: v('brand-600'),
          700: v('brand-700'),
          800: v('brand-800'),
          900: v('brand-900'),
          950: v('brand-950'),
        },
        // Accent gold (badges, highlights).
        gold: {
          50: v('gold-50'),
          100: v('gold-100'),
          200: v('gold-200'),
          300: v('gold-300'),
          400: '#e5ae32',
          500: '#cf8f1e',
          600: v('gold-600'),
          700: v('gold-700'),
          800: v('gold-800'),
          900: '#643518',
        },
        // Semantic surfaces.
        canvas: v('canvas'),
        surface: v('surface'),
        code: { DEFAULT: v('code-bg'), fg: v('code-fg') },
        // Solid fills that keep a light-on-dark treatment in both themes.
        primary: v('primary'),
        'on-primary': v('on-primary'),
        'danger-solid': '#b42318',
        // Status text/tints (theme aware).
        danger: v('danger'),
        success: v('success'),
        warning: v('warning'),
        // Stock semantic scales (tints + text tones flip, mid-tones stay literal).
        red: scale('red', RED),
        emerald: scale('emerald', EMERALD),
        amber: scale('amber', AMBER),
        sky: scale('sky', SKY),
      },
      fontFamily: {
        sans: ['Tajawal', 'Cairo', 'Segoe UI', 'Tahoma', 'sans-serif'],
        display: ['Cairo', 'Tajawal', 'Segoe UI', 'Tahoma', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 24, 40, 0.06), 0 8px 24px -12px rgba(16, 24, 40, 0.18)',
        float: '0 18px 40px -18px rgba(16, 24, 40, 0.35)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
