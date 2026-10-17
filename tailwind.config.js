/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-page': '#F5F5F7',
        'brand-dark': '#1D1D1F',
        'brand-surface': '#FFFFFF',
        'brand-silver': '#AAAAAA',
        'brand-primary': '#007AFF',
        'brand-accent': '#5AC8FA',
        'brand-live': '#D92D20',
      },
      boxShadow: {
        'glass': '0 12px 32px rgba(29, 29, 31, 0.08)',
        'neon-cyan': '0 0 15px rgba(0, 122, 255, 0.16)',
        'neon-red': '0 0 15px rgba(217, 45, 32, 0.16)',
      },
    },
  },
  plugins: [],
};