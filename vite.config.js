import { defineConfig }      from 'vite'
import tailwindcss           from '@tailwindcss/vite'
import { viteStaticCopy }    from 'vite-plugin-static-copy'

export default defineConfig({
  // Base para GitHub Pages: https://zaguan-estudio.github.io/traficotenerife/
  base: '/traficotenerife/',

  plugins: [
    tailwindcss(),
    // Copia js/ e img/ al dist/ (no son módulos ES, Vite no los bundlea)
    viteStaticCopy({
      targets: [
        { src: 'js',  dest: '.' },
        { src: 'img', dest: '.' },
      ]
    }),
  ],

  build: {
    outDir: 'dist',
  },
})
