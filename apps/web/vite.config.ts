import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@farmacia/contracts': path.resolve(__dirname, '../../packages/contracts/src/index.ts'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/@mui/') || id.includes('/node_modules/@emotion/')) {
            return 'ui';
          }

          if (id.includes('/node_modules/@tanstack/')) {
            return 'query';
          }

          if (
            id.includes('/node_modules/react-hook-form/') ||
            id.includes('/node_modules/@hookform/') ||
            id.includes('/node_modules/zod/')
          ) {
            return 'forms';
          }

          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/react-router')
          ) {
            return 'react';
          }

          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api/v1': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
