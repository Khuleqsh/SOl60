import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// No chunkSizeWarningLimit override: real bundle warnings stay visible.
// Three.js core and its addons get their own cacheable chunks; the title screen loads neither.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: false },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'three-core', test: /node_modules[\\/]three[\\/]build[\\/]three\.core/ },
            { name: 'three-renderer', test: /node_modules[\\/]three[\\/]build[\\/]three\.module/ },
            { name: 'three-addons', test: /node_modules[\\/]three[\\/]examples/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
