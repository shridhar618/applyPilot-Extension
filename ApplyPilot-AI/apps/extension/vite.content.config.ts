import { resolve } from "node:path";
import { defineConfig } from "vite";

// Self-contained IIFE injected on demand via chrome.scripting.executeScript({ files: ["content.js"] }).
export default defineConfig({
  build: {
    outDir: "dist", emptyOutDir: false, target: "es2022", minify: "esbuild",
    lib: { entry: resolve(__dirname, "src/content/extract.ts"), name: "ApplyPilotContent", formats: ["iife"], fileName: () => "content.js" },
  },
});
