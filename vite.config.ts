import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
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
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      // Removed hardcoded Supabase/Vercel keys to allow runtime resolution
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
