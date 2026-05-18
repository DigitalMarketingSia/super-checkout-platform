/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx,json}',
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#05050A',
          card: '#0A0A0F',
          border: 'rgba(255, 255, 255, 0.05)',
          text: '#A1A7B3',
          textMain: '#FFFFFF',
        },
        primary: {
          DEFAULT: '#8A2BE2',
          hover: '#9D4EDD',
          light: '#C77DFF',
          dark: '#6D1CB8',
          glow: 'rgba(138, 43, 226, 0.5)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Montserrat', 'sans-serif'],
      },
      keyframes: {
        'gradient-x': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      animation: {
        'gradient-x': 'gradient-x 3s ease infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  safelist: [
    'from-primary/5',
    'from-green-500/5',
    'bg-green-100',
    'text-green-700',
    'bg-red-100',
    'text-red-700',
    'bg-orange-500/10',
    'text-orange-400',
    'border-orange-500/20',
    'bg-blue-500/20',
    'text-blue-400',
    'border-blue-500/20',
    'bg-purple-500/20',
    'text-purple-400',
    'border-purple-500/20',
  ],
  plugins: [],
};
