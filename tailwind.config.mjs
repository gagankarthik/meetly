/** @type {import('tailwindcss').Config} */
export default {
  content: ['./*.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
        display: ['Geist', 'Inter', 'sans-serif'],
      },
      colors: {
        // Warm-paper neutrals — never pure white, never pure black.
        paper: {
          50:  '#FFFFFF',
          100: '#FAFAF7',
          200: '#F4F4F0',
          300: '#ECECE7',
          400: '#D4D4CE',
          500: '#A8A8A0',
          600: '#6E6E66',
          700: '#4A4A44',
          800: '#2C2C28',
          900: '#0F0F0D',
        },
        accent: {
          DEFAULT: '#6D28D9',
          50:  '#F5F1FE',
          100: '#EAE2FD',
          200: '#D5C5FB',
          300: '#B596F7',
          400: '#9168F1',
          500: '#7C3AED',
          600: '#6D28D9',
          700: '#5B21B6',
        },
        signal: {
          live: '#DC2626',
          ai:   '#0EA5E9',
          ok:   '#16A34A',
          warn: '#D97706',
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%':       { opacity: '0.55', transform: 'scale(0.85)' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'fade-up': {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'pulse-dot': 'pulse-dot 1.4s ease-in-out infinite',
        'shimmer':   'shimmer 2.2s linear infinite',
        'fade-up':   'fade-up 260ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      boxShadow: {
        'glass':       '0 1px 0 0 rgba(255,255,255,0.7) inset, 0 24px 60px -22px rgba(15,15,13,0.16), 0 0 0 1px rgba(15,15,13,0.04)',
        'glass-soft':  '0 1px 0 0 rgba(255,255,255,0.6) inset, 0 14px 36px -18px rgba(15,15,13,0.10)',
        'glow-accent': '0 6px 20px -6px rgba(109,40,217,0.40)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
