import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import compression from 'vite-plugin-compression';

export default defineConfig({
  plugins: [
    react(),
    compression({ algorithm: 'gzip' }),
    compression({ algorithm: 'brotliCompress' }),
  ],
  server: {
    port: 3000,
    proxy: {
      '/exec': {
        target: 'https://script.google.com',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom')) return 'vendor-react';
          if (id.includes('node_modules/react')) return 'vendor-react';
          if (id.includes('node_modules/react-router')) return 'vendor-router';
        },
      },
    },
    cssCodeSplit: true,
  },
});
