import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/micro-apps/base64-tool/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Base64 Encoder/Decoder',
        short_name: 'Base64 Tool',
        description: 'Encode and decode text and files to/from Base64',
        start_url: './',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#ffffff',
        theme_color: '#0ea5e9',
        categories: ['utilities', 'developer tools'],
        icons: [
          { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
          { src: '/icon-192-maskable.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'maskable' },
          { src: '/icon-512-maskable.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /\.(?:js|css|html)$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'static-assets' },
          },
        ],
      },
    }),
  ],
});
