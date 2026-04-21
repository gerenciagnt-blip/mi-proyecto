import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta de marca Sistema PILA
        brand: {
          blue: '#1E88E5',
          'blue-dark': '#1565C0',
          green: '#43A047',
          'green-dark': '#2E7D32',
          turquoise: '#26C6DA',
          'gray-dark': '#4A4A4A',
          'gray-light': '#9E9E9E',
        },
        // Semánticos
        success: '#43A047',
        danger: '#E53935',
        warning: '#FBC02D',
      },
      fontFamily: {
        sans: ['var(--font-roboto)', 'system-ui', 'sans-serif'],
        heading: ['var(--font-montserrat)', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'brand-gradient':
          'linear-gradient(135deg, #1E88E5 0%, #43A047 50%, #26C6DA 100%)',
        'brand-gradient-h': 'linear-gradient(90deg, #1E88E5 0%, #43A047 100%)',
      },
      boxShadow: {
        brand: '0 10px 40px -10px rgba(30, 136, 229, 0.25)',
      },
    },
  },
  plugins: [animate],
};

export default config;
