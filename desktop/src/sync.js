/** Login + history sync (desktop, mirrors extension flow) */

async function invoke(cmd, args) {
  const { invoke: inv } = await import("@tauri-apps/api/core");
  return inv(cmd, args);
}

function setLoginStatus(text) {
  const el = document.getElementById("login-status");
  if (el) el.textContent = text || "";
}

async function refreshLoginUi() {
  const btn = document.getElementById("btn-login");
  try {
    const st = await invoke("get_login_status");
    if (st?.logged_in) {
      const name = st.uname || "已登录";
      if (btn) btn.textContent = name.length > 8 ? name.slice(0, 8) + "…" : name;
      const csrf = st.has_csrf ? "" : " · 缺少 bili_jct（删除历史需要）";
      setLoginStatus(`当前：已登录 ${name}${st.mid ? " (mid " + st.mid + ")" : ""}${csrf}`);
      return st;
    }
  } catch (e) {
    console.warn("[sync] get_login_status", e);
  }
  if (btn) btn.textContent = "登录";
  setLoginStatus("当前：未登录");
  return null;
}

function openLoginModal() {
  const m = document.getElementById("login-modal");
  if (m) m.hidden = false;
  void refreshLoginUi();
}

function closeLoginModal() {
  const m = document.getElementById("login-modal");
  if (m) m.hidden = true;
}

async function saveLogin() {
  const ta = document.getElementById("login-sessdata");
  const jctEl = document.getElementById("login-bili-jct");
  const sessdata = (ta?.value || "").trim();
  const biliJct = (jctEl?.value || "").trim();
  if (!sessdata) {
    setLoginStatus("请粘贴 SESSDATA");
    return;
  }
  setLoginStatus("正在验证…");
  try {
    const st = await invoke("save_sessdata", {
      sessdata,
      biliJct: biliJct || null,
    });
    const tip = st.has_csrf ? "" : "（未填 bili_jct，删除历史将不可用）";
    setLoginStatus(`验证成功：${st.uname || "已登录"}${tip}`);
    if (ta) ta.value = "";
    if (jctEl) jctEl.value = "";
    await refreshLoginUi();
    setTimeout(closeLoginModal, 600);
  } catch (e) {
    setLoginStatus("验证失败：" + (e?.message || String(e)));
  }
}

async function clearLogin() {
  try {
    await invoke("clear_sessdata");
    await refreshLoginUi();
    setLoginStatus("已清除登录");
  } catch (e) {
    setLoginStatus("清除失败：" + (e?.message || String(e)));
  }
}

function openSyncModal() {
  const m = document.getElementById("sync-modal");
  if (m) m.hidden = false;
  void refreshSyncMeta();
}

function closeSyncModal() {
  const m = document.getElementById("sync-modal");
  if (m) m.hidden = true;
}

async function refreshSyncMeta() {
  const el = document.getElementById("sync-last");
  try {
    const meta = await invoke("get_sync_meta");
    if (el) {
      if (meta?.last_sync_at) {
        el.textContent = "上次同步：" + new Date(meta.last_sync_at).toLocaleString();
      } else {
        el.textContent = "尚未同步过";
      }
    }
  } catch {
    if (el) el.textContent = "尚未同步过";
  }
}

function setSyncProgress(visible, tip) {
  const box = document.getElementById("sync-progress");
  const tipEl = document.getElementById("sync-progress-tip");
  if (box) box.hidden = !visible;
  if (tipEl && tip) tipEl.textContent = tip;
}

function setSyncStats(fetched, pages, newest) {
  const a = document.getElementById("sync-stat-fetched");
  const b = document.getElementById("sync-stat-pages");
  const c = document.getElementById("sync-stat-newest");
  if (a) a.textContent = String(fetched);
  if (b) b.textContent = String(pages);
  if (c) c.textContent = newest != null ? String(newest) : "—";
}

function setSyncResult(text, ok) {
  const el = document.getElementById("sync-result");
  if (!el) return;
  if (!text) {
    el.hidden = true;
    el.textContent = "";
    el.className = "sync-result";
    return;
  }
  el.hidden = false;
  el.textContent = text;
  el.className = "sync-result " + (ok ? "ok" : "err");
}

async function runHistorySync() {
  const mode =
    document.querySelector('input[name="sync-mode"]:checked')?.value || "incremental";
  setSyncResult("");
  setSyncProgress(true, "正在获取第一页数据…");
  setSyncStats(0, 0, null);
  const startBtn = document.getElementById("sync-start");
  if (startBtn) startBtn.disabled = true;

  try {
    const st = await invoke("get_login_status");
    if (!st?.logged_in) {
      throw new Error("未登录，请先配置 SESSDATA");
    }

    let meta = { watermark_view_at: 0, last_sync_at: null };
    try {
      meta = await invoke("get_sync_meta");
    } catch {}

    const watermark =
      mode === "full" ? 0 : Number(meta?.watermark_view_at || 0) || 0;

    const b = globalThis.__bili;
    if (!b) throw new Error("应用未就绪");

    let pack = b.pack || {
      formatVersion: 2,
      exportedAt: "",
      history: [],
      historyEvents: [],
      historyTombstones: [],
      likedMusic: [],
      favFolders: [],
      favResources: [],
      subscribedCollections: [],
      subscribedCollectionResources: [],
    };

    const existing = new Map();
    for (const it of pack.history || []) {
      const k = String(it.business || "archive") + "|" + String(it.id ?? "");
      existing.set(k, it);
    }

    let max = 0;
    let viewAt = 0;
    let pages = 0;
    let fetched = 0;
    let newest = 0;
    let isEnd = false;

    while (!isEnd && pages < 200) {
      const page = await invoke("fetch_history_page", { max, viewAt });
      pages += 1;
      const items = page?.items || [];
      fetched += items.length;
      for (const it of items) {
        const va = Number(it.view_at || 0);
        if (va > newest) newest = va;
        if (watermark && va && va <= watermark) {
          isEnd = true;
          break;
        }
        const k = String(it.business || "archive") + "|" + String(it.id ?? "");
        existing.set(k, it);
      }
      setSyncStats(fetched, pages, newest || null);
      setSyncProgress(true, `已扫描 ${pages} 页，累计 ${fetched} 条…`);

      if (page?.is_end || !items.length) break;
      if (isEnd) break;
      max = page.cursor_max || 0;
      viewAt = page.cursor_view_at || 0;
      if (!max && !viewAt) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    const history = Array.from(existing.values()).sort(
      (a, c) => Number(c.view_at || 0) - Number(a.view_at || 0),
    );
    pack = { ...pack, history, exportedAt: new Date().toISOString() };
    b.pack = pack;
    b.sourceName = "在线同步 · B 站历史";
    if (b.fileMeta) {
      b.fileMeta.textContent =
        b.sourceName +
        "\n历史 " +
        history.length +
        " · 收藏 " +
        (pack.favFolders?.length || 0) +
        " · 音乐 " +
        (pack.likedMusic?.length || 0);
    }
    if (typeof b.persistPack === "function") {
      try {
        await b.persistPack();
      } catch (err) {
        console.warn("[sync] persistPack", err);
      }
    }
    if (typeof b.resetAndRender === "function") b.resetAndRender();
    else b.render?.();

    const now = Date.now();
    await invoke("save_sync_meta", {
      watermarkViewAt: newest || watermark || 0,
      lastSyncAt: now,
    });

    setSyncProgress(false);
    setSyncResult(`同步完成：本轮拉取 ${fetched} 条，本地历史共 ${history.length} 条`, true);
    await refreshSyncMeta();
  } catch (e) {
    console.error(e);
    setSyncProgress(false);
    setSyncResult("同步失败：" + (e?.message || String(e)), false);
  } finally {
    if (startBtn) startBtn.disabled = false;
  }
}

document.getElementById("btn-login")?.addEventListener("click", openLoginModal);
document.getElementById("btn-sync-history")?.addEventListener("click", openSyncModal);
document.getElementById("login-close")?.addEventListener("click", closeLoginModal);
document.getElementById("login-cancel")?.addEventListener("click", closeLoginModal);
document.getElementById("login-save")?.addEventListener("click", () => void saveLogin());
document.getElementById("login-logout")?.addEventListener("click", () => void clearLogin());
document.getElementById("login-modal")?.addEventListener("click", (e) => {
  if (e.target?.id === "login-modal") closeLoginModal();
});
document.getElementById("sync-close")?.addEventListener("click", closeSyncModal);
document.getElementById("sync-cancel")?.addEventListener("click", closeSyncModal);
document.getElementById("sync-start")?.addEventListener("click", () => void runHistorySync());
document.getElementById("sync-modal")?.addEventListener("click", (e) => {
  if (e.target?.id === "sync-modal") closeSyncModal();
});

void refreshLoginUi();
