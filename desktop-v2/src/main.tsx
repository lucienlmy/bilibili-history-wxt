// browser 兼容层必须最先加载：扩展页面在模块顶层就会用到全局 browser
import { initStorageFromDisk } from "./browserShim";
import React from "react";
import ReactDOM from "react-dom/client";
import { initTheme } from "../../utils/theme";
import { bootstrapLocalData } from "./bootstrap";
import DesktopApp from "./DesktopApp";
// 复用扩展的 Tailwind 主样式（扩展原本在 my-history/main.tsx 引入）
import "../../entrypoints/my-history/style.css";
import "./desktop.css";

initTheme();

const mount = () => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <DesktopApp />
    </React.StrictMode>,
  );
};

/** 桌面宽屏下固定 4 列会把卡片拉得过宽，首次启动改为自适应列数（auto），
 *  之后用户在「视图设置」里改过就不再覆盖。 */
const applyDesktopDefaults = async () => {
  const flag = "bh:storage:DESKTOP_GRID_DEFAULT_SET";
  if (localStorage.getItem(flag) === "1") return;
  const browser = (globalThis as any).browser;
  const { GRID_COLUMNS } = await import("../../utils/constants");
  const stored = await browser.storage.local.get(GRID_COLUMNS);
  const current = stored[GRID_COLUMNS];
  // 未设置过，或仍是桌面版不合适的默认固定 4 列 → 改为自适应
  if (current === undefined || current === 4 || current === "4") {
    await browser.storage.local.set({ [GRID_COLUMNS]: "auto" });
  }
  localStorage.setItem(flag, "1");
};

// 先加载磁盘配置，再应用默认值（避免覆盖用户已有设置）；数据灌入可并行
Promise.all([
  initStorageFromDisk().then(applyDesktopDefaults),
  bootstrapLocalData(),
])
  .catch((error) => console.error("[desktop] 数据初始化失败", error))
  .finally(mount);
