import { defineConfig }      from 'vite'
import tailwindcss           from '@tailwindcss/vite'
import { viteStaticCopy }    from 'vite-plugin-static-copy'

export default defineConfig({
  // Base relativa: funciona tanto en GitHub Pages como abierto directamente
  base: './',

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
