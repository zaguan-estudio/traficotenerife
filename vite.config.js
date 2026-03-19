import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Base para GitHub Pages: https://zaguan-estudio.github.io/traficotenerife/
  base: '/traficotenerife/',
  plugins: [
    tailwindcss(),
  ],
  build: {
    outDir: 'dist',
  },
})
