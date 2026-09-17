import { resolve } from "node:path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => ({
  plugins: [vue(), {
    name: "qa-legacy-url",
    apply: "serve",
    configureServer(server) {
      // Keep existing QA bookmarks; the maintained page lives outside ignored .tmp-*.
      server.middlewares.use((req, _res, next) => {
        if (req.url && /^\/\.tmp-species-qa\/(?:index\.html)?(?:\?|$)/.test(req.url)) {
          req.url = req.url.replace(/^\/\.tmp-species-qa\/(?:index\.html)?/, "/qa/index.html");
        }
        next();
      });
    },
  }],
  clearScreen: false,
  build: {
    rollupOptions: {
      input: {
        overlay: resolve(__dirname, "index.html"),
        settings: resolve(__dirname, "settings.html"),
      },
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
