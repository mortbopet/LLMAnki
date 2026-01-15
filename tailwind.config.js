/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        anki: {
          blue: '#2196F3',
          green: '#4CAF50',
          red: '#f44336',
          orange: '#FF9800',
          dark: '#1a1a2e',
          darker: '#16162a',
        }
      }
    },
  },
  plugins: [],
}
