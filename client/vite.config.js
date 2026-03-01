import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_URL || 'http://localhost:3001';
  const wsTarget = env.VITE_WS_URL || 'ws://localhost:3001';
  const devPort = parseInt(env.VITE_DEV_PORT || '3000', 10);

  return {
    plugins: [react()],
    server: {
      port: devPort,
      proxy: {
        '/api': apiTarget,
        '/uploads': apiTarget,
        '/ws': {
          target: wsTarget,
          ws: true,
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './test/setup.js',
    },
  };
});
