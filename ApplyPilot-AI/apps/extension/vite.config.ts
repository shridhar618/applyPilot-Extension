import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

// Pages (popup, side panel) + the MV3 service worker. The content script is built separately (vite.content.config.ts)
// because content scripts must be self-contained classic scripts, not ES modules with shared chunks.
export default defineConfig(({ mode }) => ({
  base: "./", // extension pages are served from chrome-extension://<id>/, so asset URLs must be relative
  plugins: [react()],
  build: {
    outDir: "dist", emptyOutDir: true, target: "es2022", sourcemap: mode === "development",
    minify: mode === "development" ? false : "esbuild",
    rollupOptions: {
      input: { popup: resolve(__dirname, "popup.html"), sidepanel: resolve(__dirname, "sidepanel.html"), background: resolve(__dirname, "src/background/service-worker.ts") },
      output: { entryFileNames: (c) => (c.name === "background" ? "background.js" : "assets/[name]-[hash].js") },
    },
  },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/test-setup.ts"], css: false },
}));
