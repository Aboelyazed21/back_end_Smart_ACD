/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f4f7fa',
          100: '#e6edf4',
          200: '#c9d8e6',
          300: '#a1b9d0',
          400: '#7294b4',
          500: '#527699',
          600: '#3f5e7e',
          700: '#344c66',
          800: '#2c3f54',
          900: '#1d2c3b',
          950: '#111b25',
        },
        brand: {
          50: '#eefbf7',
          100: '#d5f5eb',
          200: '#aeead9',
          300: '#79d8c2',
          400: '#46bfa6',
          500: '#28a48d',
          600: '#1d8474',
          700: '#1a6a5f',
          800: '#18554d',
          900: '#164741',
          950: '#072a27',
        },
        gold: {
          50: '#fdf9ed',
          100: '#f9efc9',
          200: '#f3dd92',
          300: '#ecc65a',
          400: '#e5ae32',
          500: '#cf8f1e',
          600: '#b06d16',
          700: '#8d4f15',
          800: '#753f18',
          900: '#643518',
        },
        danger: '#b42318',
        success: '#067647',
        warning: '#b54708',
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
