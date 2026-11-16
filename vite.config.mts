import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // The API is the Cloudflare Worker; `npm run api:dev` serves it on 8787 by default.
  const proxy = { '/v1': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:8787', changeOrigin: true } };
  return {
    root: 'web',
    plugins: [react()],
    server: { proxy },
    preview: { proxy },
    define: {
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL ?? ''),
    },
    build: { outDir: '../dist-web', emptyOutDir: true },
  };
});
