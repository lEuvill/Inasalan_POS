import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#F5A623',
          dark: '#E09316',
        },
        surface: '#F8F9FA',
      },
      borderRadius: {
        '2xl': '16px',
      },
    },
  },
  plugins: [],
}
export default config
