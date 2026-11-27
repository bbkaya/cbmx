import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { boundaries } from './boundaries.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
const repo = fileURLToPath(new URL('../../', import.meta.url));
const server = await createServer({ root, publicDir: `${repo}public`, configFile: false, envFile: false, plugins: [boundaries()],
  esbuild: { jsx: 'automatic' }, resolve: { alias: { react: `${repo}node_modules/react`, 'react-dom': `${repo}node_modules/react-dom` } },
  server: { host: '127.0.0.1', port: 5177, strictPort: true, fs: { allow: [repo] } },
  optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom'] } });
await server.listen();
console.log('Offline autosave review: http://127.0.0.1:5177 — no environment files, auth, or database.');
