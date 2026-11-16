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

// 先加载磁盘配置 + 灌入本地数据，再挂载 UI，保证首屏即可读到历史与设置
Promise.all([initStorageFromDisk(), bootstrapLocalData()])
  .catch((error) => console.error("[desktop] 数据初始化失败", error))
  .finally(mount);
