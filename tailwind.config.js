/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cora: {
          50: '#faf6ff',
          100: '#f2e9fb',
          200: '#e4d0f5',
          300: '#cda9ea',
          400: '#af75dc',
          500: '#9148ca',
          600: '#772eae',
          700: '#5e238b',
          800: '#4e2070',
          900: '#3b0a57',
          950: '#27043d'
        },
        rosebank: '#d2387c'
      },
      boxShadow: {
        soft: '0 18px 60px rgba(48, 13, 68, 0.10)',
        card: '0 8px 30px rgba(48, 13, 68, 0.08)'
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      }
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
