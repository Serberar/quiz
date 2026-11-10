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
        name: 'Quiz',
        short_name: 'Quiz',
        description: 'Tests de práctica para exámenes tipo test',
        lang: 'es',
        theme_color: '#070a18',
        background_color: '#070a18',
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
          {
            // Tipografía: se guarda la primera vez para que funcione sin conexión
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 20 } },
          },
        ],
      },
    }),
  ],
})
