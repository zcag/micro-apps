import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/micro-apps/lorem-gen/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Lorem Ipsum Generator',
        short_name: 'Lorem',
        description: 'Generate placeholder text in multiple styles — classic, hipster, pirate, corporate, and bacon ipsum',
        start_url: './',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#ffffff',
        theme_color: '#8B5CF6',
        categories: ['utilities', 'productivity'],
        icons: [
          { src: 'icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: 'icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
          { src: 'icon-192-maskable.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'maskable' },
          { src: 'icon-512-maskable.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
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
