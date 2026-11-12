import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  // 避免向上解析到仓库根目录的 wxt tsconfig
  root: resolve(__dirname),
  clearScreen: false,
  server: { port: 1421, strictPort: true },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "esnext",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    outDir: "dist",
    emptyOutDir: true,
  },
});
