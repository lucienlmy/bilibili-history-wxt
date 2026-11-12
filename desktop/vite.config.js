import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  clearScreen: false,
  server: { port: 1421, strictPort: true },
  envPrefix: ["VITE_", "TAURI_"],
  // 不继承仓库根目录的 wxt tsconfig / postcss
  esbuild: {
    tsconfigRaw: "{}",
  },
  css: {
    postcss: path.join(root, "postcss.config.js"),
  },
  build: {
    target: "esnext",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    outDir: "dist",
    emptyOutDir: true,
  },
});
