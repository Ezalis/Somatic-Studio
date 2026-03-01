import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function processShimPlugin(): Plugin {
    return {
        name: 'process-shim',
        transformIndexHtml(html) {
            return html.replace(
                '<head>',
                `<head><script>window.process = window.process || { env: {}, platform: "browser", version: "", versions: {}, arch: "", emit: function(){}, on: function(){}, once: function(){}, off: function(){}, removeListener: function(){} };</script>`
            );
        },
    };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        watch: { usePolling: true },
      },
      plugins: [processShimPlugin(), tailwindcss(), react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
        'process.env.NODE_ENV': JSON.stringify(mode),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
