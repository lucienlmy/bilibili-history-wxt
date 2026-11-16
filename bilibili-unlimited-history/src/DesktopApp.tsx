/**
 * 桌面版根组件：直接复用扩展的 App（HashRouter + 所有页面/组件/样式）。
 * 只在顶部叠加一条桌面工具条，提供「导入备份 / 登录状态 / 同步」入口。
 */
import { useCallback, useEffect, useState } from "react";
import ExtensionApp from "../../entrypoints/my-history/App";
import { openBackup } from "./bootstrap";
import { invoke, getLoginStatus } from "./tauri";
import { syncHistory, syncFavorites, syncSubscribedCollections } from "./desktopSync";

type LoginStatus = { logged_in: boolean; uname: string | null; mid: number | null };

const DesktopApp = () => {
  const [login, setLogin] = useState<LoginStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refreshLogin = useCallback(() => {
    getLoginStatus()
      .then(setLogin)
      .catch(() => setLogin({ logged_in: false, uname: null, mid: null }));
  }, []);

  useEffect(() => refreshLogin(), [refreshLogin]);

  const handleImport = async () => {
    setBusy(true);
    setMessage("");
    try {
      const pack = await openBackup();
      if (pack) {
        setMessage(`已导入备份：历史 ${(pack.history ?? []).length} 条，正在刷新...`);
        // 页面只在挂载时读 IndexedDB，重载是最简单可靠的刷新方式
        window.setTimeout(() => window.location.reload(), 400);
      }
    } catch (error) {
      setMessage(`导入失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async () => {
    setMessage("");
    const sessdata = window.prompt("请输入 B 站 Cookie 中的 SESSDATA：");
    if (!sessdata?.trim()) return;
    const biliJct = window.prompt("请输入 bili_jct（用于删除操作，可留空）：") ?? "";
    setBusy(true);
    try {
      // 写入浏览器兼容层的 storage（browserShim 用 bh:storage: 前缀存 localStorage）
      localStorage.setItem("bh:storage:DESKTOP_SESSDATA", JSON.stringify(sessdata.trim()));
      if (biliJct.trim()) {
        localStorage.setItem("bh:storage:DESKTOP_BILI_JCT", JSON.stringify(biliJct.trim()));
      }
      await invoke("save_sessdata", { sessdata: sessdata.trim(), bili_jct: biliJct.trim() });
      refreshLogin();
      setMessage("登录信息已保存");
    } catch (error) {
      setMessage(`登录失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSync = async () => {
    setBusy(true);
    setMessage("正在同步历史记录...");
    try {
      await syncHistory(false);
      setMessage("历史同步完成，正在同步收藏夹...");
      await syncFavorites();
      setMessage("收藏夹同步完成，正在同步订阅合集...");
      await syncSubscribedCollections();
      setMessage("同步完成，正在刷新...");
      // 同步写入 IndexedDB 后重载，让各页面重新拉取
      window.setTimeout(() => window.location.reload(), 400);
    } catch (error) {
      setMessage(`同步失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="desktop-shell">
      <div className="desktop-toolbar">
        <span className="desktop-toolbar__brand">Bilibili 无限历史记录 · 桌面版</span>
        <span className="desktop-toolbar__spacer" />
        <span className="desktop-toolbar__login">
          {login?.logged_in ? `已登录：${login.uname ?? login.mid}` : "未登录 B 站"}
        </span>
        <button onClick={handleImport} disabled={busy}>导入备份</button>
        <button onClick={handleLogin} disabled={busy}>登录</button>
        <button onClick={handleSync} disabled={busy}>同步</button>
        {message && <span className="desktop-toolbar__msg">{message}</span>}
      </div>
      <div className="desktop-content">
        <ExtensionApp />
      </div>
    </div>
  );
};

export default DesktopApp;
