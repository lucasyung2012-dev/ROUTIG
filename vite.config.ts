/// <reference types="vitest" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serve o app em /ROUTIG/. Em outro host, defina ROUTIG_BASE.
const base = process.env.ROUTIG_BASE ?? '/ROUTIG/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['brand/routig-logo-original.png'],
      manifest: {
        name: 'ROUTIG',
        short_name: 'ROUTIG',
        description: 'Your route. Your progress.',
        lang: 'pt-BR',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: '#080B1C',
        theme_color: '#080B1C',
        // Ícone = PNG original aprovado. A versão vetorial só entra depois da aprovação.
        icons: [{ src: 'brand/routig-logo-original.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
