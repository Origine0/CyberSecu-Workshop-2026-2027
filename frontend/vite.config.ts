import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Toutes les requêtes API passent par le WAF (seul point d'entrée exposé) :
//   /api -> payment-api, /auth -> service d'authentification, /ai -> assistant IA.
// Cible surchargeable : VITE_PROXY_TARGET=http://192.168.137.1:8082 npm run dev
const proxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:8082';
const proxied = { target: proxyTarget, changeOrigin: true };

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      allowedHosts: true as const,
      proxy: { '/api': proxied, '/auth': proxied, '/ai': proxied },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Enable polling for Docker volume mounts on Windows/WSL2
      watch: process.env.DISABLE_HMR === 'true' ? null : { usePolling: true },
    },
  };
});
