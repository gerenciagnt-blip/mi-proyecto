import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta de marca Sistema PILA — refinada premium
        brand: {
          blue: '#2F80ED',
          'blue-dark': '#1C4E80',
          green: '#27AE60',
          'green-dark': '#1E874B',
          turquoise: '#26C6DA',
          surface: '#F4F7FB',
          border: '#E3E8EF',
          'text-primary': '#1F2937',
          'text-secondary': '#6B7280',
          'text-muted': '#9CA3AF',
        },
        // Semánticos
        success: '#27AE60',
        danger: '#E53935',
        warning: '#FBC02D',
      },
      fontFamily: {
        sans: ['var(--font-roboto)', 'system-ui', 'sans-serif'],
        heading: ['var(--font-montserrat)', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #2F80ED 0%, #27AE60 100%)',
        'brand-gradient-h': 'linear-gradient(90deg, #2F80ED 0%, #27AE60 100%)',
        'brand-surface': 'linear-gradient(180deg, #F4F7FB 0%, #EAF1F9 100%)',
      },
      boxShadow: {
        brand: '0 10px 20px rgba(47, 128, 237, 0.25)',
        'brand-lg': '0 15px 25px rgba(47, 128, 237, 0.35)',
        'card-float': '0 20px 50px rgba(0, 0, 0, 0.08)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out',
      },
    },
  },
  plugins: [animate],
};

export default config;
