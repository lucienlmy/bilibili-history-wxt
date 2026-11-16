import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");

/** 把扩展的 localBackupHandle 重定向到桌面版（FileSystemDirectoryHandle 无法在 WebView 使用）。 */
const desktopLocalBackupPlugin = {
  name: "desktop-local-backup-handle",
  enforce: "pre" as const,
  resolveId(source: string, importer: string | undefined) {
    if (!importer) return null;
    // 只匹配以 localBackupHandle 结尾的相对导入，避免误伤其它模块
    const normalized = source.replace(/\\/g, "/");
    if (/(^|\/)localBackupHandle$/.test(normalized)) {
      return path.resolve(__dirname, "src/desktop/localBackupHandle.ts");
    }
    return null;
  },
};

export default defineConfig({
  plugins: [desktopLocalBackupPlugin, react()],
  resolve: {
    // 扩展源码用 "@/..." 指向仓库根，桌面版沿用同一套别名以便原样复用 UI
    alias: {
      "@": repoRoot,
      "~": repoRoot,
      "@@": repoRoot,
      "~~": repoRoot,
    },
    // 复用的页面从仓库根 node_modules 解析，桌面壳从自身 node_modules 解析，
    // 强制 dedupe 避免加载两份 React 导致 Hooks 报错
    dedupe: ["react", "react-dom", "react-router-dom", "react-hot-toast", "zustand"],
  },
  // 使用本目录下的 postcss.config.js / tailwind.config.js（扫描仓库根的共享源码）
  envDir: repoRoot,
  server: {
    port: 1422,
  },
  clearScreen: false,
});
