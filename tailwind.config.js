/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fdf4ff',
          100: '#fae8ff',
          200: '#f5d0fe',
          300: '#f0abfc',
          400: '#e879f9',
          500: '#d946ef',
          600: '#c026d3',
          700: '#a21caf',
          800: '#86198f',
          900: '#701a75',
        },
        accent: {
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
        },
        dark: {
          50: '#f8fafc',
          800: '#1e1e28',
          900: '#14141c',
          950: '#0f0f14',
        },
      },
      fontFamily: {
        sans: ['Tajawal', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'heart-pop': 'heartPop 0.8s ease-out forwards',
        'like-pop': 'likePop 0.35s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        heartPop: {
          '0%': { transform: 'scale(0.3)', opacity: '0' },
          '15%': { transform: 'scale(1.25)', opacity: '1' },
          '30%': { transform: 'scale(0.95)', opacity: '1' },
          '70%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(1.15)', opacity: '0' },
        },
        likePop: {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.35)' },
          '100%': { transform: 'scale(1)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
