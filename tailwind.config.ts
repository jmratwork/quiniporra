import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        quiniela: {
          DEFAULT: '#0d6e3f',
          dark: '#0a512f',
          light: '#e7f4ec',
        },
      },
    },
  },
  plugins: [],
};

export default config;
