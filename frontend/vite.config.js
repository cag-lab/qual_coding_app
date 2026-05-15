import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Output into the backend so Express can serve it as static files in prod.
    outDir: '../backend/public',
    emptyOutDir: true,
  },
  server: {
    // Forward /api calls to the local Express server during development.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
