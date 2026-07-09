import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Verde césped (acento neón sobre fondo oscuro).
        cesped: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        // Fondo "noche de estadio".
        noche: {
          700: '#0d2419',
          800: '#0a1c13',
          900: '#07160e',
          950: '#04100a',
        },
        // Dorado para el boleto completo y los destacados.
        oro: {
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(34,197,94,0.30), 0 10px 34px -8px rgba(34,197,94,0.50)',
        'glow-gold':
          '0 0 0 1px rgba(251,191,36,0.35), 0 10px 34px -8px rgba(251,191,36,0.45)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.5', transform: 'scale(0.85)' },
        },
        'rise-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 2.5s linear infinite',
        'pulse-dot': 'pulse-dot 1.8s ease-in-out infinite',
        'rise-in': 'rise-in 0.4s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
