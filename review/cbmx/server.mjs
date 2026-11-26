// Isolated local UI review: no application entry point, auth client, env file or database.
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../../", import.meta.url));
const server = await createServer({ root, configFile: false, envFile: false,
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@cbmx": `${repo}src/components/cbmx`, "@app": `${repo}src`,
    react: `${repo}node_modules/react`, "react-dom": `${repo}node_modules/react-dom` } },
  server: { host: "127.0.0.1", port: 5176, strictPort: true, fs: { allow: [repo] } },
  optimizeDeps: { include: ["react", "react-dom/client", "react-router-dom"] } });
await server.listen();
console.log("Synthetic Phase 4 review: http://127.0.0.1:5176 — memory only; Ctrl+C stops the server.");
