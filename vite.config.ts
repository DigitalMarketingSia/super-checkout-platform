import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(() => {
  return {
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    base: '/', // Use absolute paths for all assets to work correctly on nested routes
    server: {
      port: 5173,
      host: '0.0.0.0',
      proxy: {
        '/mp-api': {
          target: 'https://api.mercadopago.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/mp-api/, '')
        }
      }
    },
    plugins: [react()],
    build: {
      rolldownOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replace(/\\/g, '/');

            if (normalizedId.includes('/src/core/locales/')) {
              return 'i18n-resources';
            }

            if (normalizedId.includes('/src/core/services/demoDataService.ts')) {
              return 'demo-data';
            }

            if (normalizedId.includes('/src/core/services/storageService.ts')) {
              return 'storage-service';
            }

            if (normalizedId.includes('/node_modules/@supabase/')) {
              return 'supabase';
            }

            if (
              normalizedId.includes('/node_modules/i18next/') ||
              normalizedId.includes('/node_modules/react-i18next/') ||
              normalizedId.includes('/node_modules/i18next-browser-languagedetector/')
            ) {
              return 'i18n';
            }

            if (
              normalizedId.includes('/node_modules/recharts/') ||
              normalizedId.includes('/node_modules/victory-vendor/') ||
              normalizedId.includes('/node_modules/d3-')
            ) {
              return 'charts';
            }

            if (normalizedId.includes('/node_modules/@stripe/')) {
              return 'stripe';
            }

            if (normalizedId.includes('/node_modules/@xyflow/')) {
              return 'flow-vendor';
            }
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src/core'),
        '@modules': path.resolve(__dirname, './src/modules'),
        '@custom': path.resolve(__dirname, './src/custom'),
        '@src': path.resolve(__dirname, './src'),
      }
    }
  };
});
