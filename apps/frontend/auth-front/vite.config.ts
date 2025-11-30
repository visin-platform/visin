import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());

  return {
    plugins: [react()],
    server: {
      port: 3004
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, './src')
      }
    },
    define: {
      'process.env': env // Expose .env variables to the app
    },
    build: {
      modulePreload: false,
      target: 'esnext',
      minify: false,
      cssCodeSplit: false
    }
  };
});
