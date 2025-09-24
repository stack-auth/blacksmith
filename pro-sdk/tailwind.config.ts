import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        'panel': '#0b1b2b',
        'panel-light': '#13253a',
        'panel-border': '#1f3a57',
        'accent': '#3b82f6',
        'accent-soft': '#1d4ed8'
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'SFMono-Regular', 'Menlo', 'monospace'],
        sans: ['"Inter"', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        'glow': '0 0 30px rgba(59, 130, 246, 0.25)'
      }
    }
  },
  plugins: []
};

export default config;
