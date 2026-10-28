import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'Quiz DAW',
        short_name: 'Quiz DAW',
        description: 'Tests de práctica para DAW',
        lang: 'es',
        theme_color: '#0b1020',
        background_color: '#0b1020',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Las preguntas no se precachean (1+ MB); se guardan al abrirlas y se revalidan con red
        runtimeCaching: [
          {
            urlPattern: /\/data\/.*\.json$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'quiz-data', networkTimeoutSeconds: 4 },
          },
        ],
      },
    }),
  ],
})
