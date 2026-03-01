import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: ['docker-01'],
        watch: { usePolling: true },
        proxy: {
          '/api/immich': {
            target: env.IMMICH_URL || 'http://192.168.50.66:2283',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api\/immich/, '/api'),
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyReq) => {
                proxyReq.setHeader('x-api-key', env.IMMICH_API_KEY || '');
              });
            },
          },
        },
      },
      plugins: [tailwindcss(), react()],
      define: {
        'process.env.NODE_ENV': JSON.stringify(mode),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
