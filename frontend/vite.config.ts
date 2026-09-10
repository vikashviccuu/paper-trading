import { defineConfig, createLogger } from "vite";
import react from "@vitejs/plugin-react";

// Local backend URL — change this if your backend runs on a different port
const BACKEND_URL = "http://127.0.0.1:4000";

// ── Suppress noisy proxy errors when backend is offline / client disconnects ──
const SUPPRESSED_PROXY_PHRASES = [
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "EPIPE",
  "ETIMEDOUT",
];

const logger = createLogger();
const originalWarn = logger.warn.bind(logger);
const originalError = logger.error.bind(logger);

logger.warn = (msg, opts) => {
  if (SUPPRESSED_PROXY_PHRASES.some((p) => msg.includes(p))) return;
  originalWarn(msg, opts);
};
logger.error = (msg, opts) => {
  if (SUPPRESSED_PROXY_PHRASES.some((p) => msg.includes(p))) return;
  originalError(msg, opts);
};

export default defineConfig({
  customLogger: logger,
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: BACKEND_URL,
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on("error", (err, _req, res) => {
            // Only log if NOT a routine connection error (backend offline, client gone)
            if (!SUPPRESSED_PROXY_PHRASES.some((p) => err.message.includes(p))) {
              console.error(`[Vite Proxy] ${err.message}`);
            }
            if (res && !res.headersSent) {
              (res as any).writeHead(502, { "Content-Type": "application/json" });
              (res as any).end(JSON.stringify({ error: "Backend unavailable", detail: err.message }));
            }
          });
        },
      },
      "/socket.io": {
        target: BACKEND_URL,
        ws: true,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("error", (err, _req, res) => {
            // Silently drop all transient disconnect/offline errors
            if (SUPPRESSED_PROXY_PHRASES.some((p) => err.message.includes(p))) return;
            console.error(`[Vite WS Proxy] ${err.message}`);
            if (res && !res.headersSent) {
              (res as any).writeHead(502, { "Content-Type": "application/json" });
              (res as any).end(JSON.stringify({ error: "WebSocket proxy error", detail: err.message }));
            }
          });
        },
      },
    },
  },
});

