/** B 站登录 + 历史同步（对齐扩展：全量/增量 + 进度） */

function bili() {
  return globalThis.__bili || {};
}

async function invoke(cmd, args) {
  const { invoke: inv } = await import("@tauri-apps/api/core");
  return inv(cmd, args);
}

function setLoginStatus(text) {
  const el = document.getElementById("login-status");
  if (el) el.textContent = text;
}

async function refreshLoginUi() {
  const btn = document.getElementById("btn-login");
  try {
    const st = await invoke("get_login_status");
    if (st?.logged_in) {
      const name = st.uname || "已登录";
      if (btn) btn.textContent = name.length > 8 ? name.slice(0, 8) + "…" : name;
      setLoginStatus(`当前：已登录 ${name}${st.mid ? " (mid " + st.mid + ")" : ""}`);
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
  const sessdata = (ta?.value || "").trim();
  if (!sessdata) {
    setLoginStatus("请粘贴 SESSDATA");
    return;
  }
  setLoginStatus("正在验证…");
  try {
    const st = await invoke("save_sessdata", { sessdata });
    setLoginStatus(`验证成功：${st.uname || "已登录"}`);
    if (ta) ta.value = "";
    await refreshLoginUi();
    setTimeout(closeLoginModal, 500);
  } catch (e) {
    setLoginStatus("验证失败：" + (e?.message || String(e)));
  }
}

async function clearLogin() {
  try {
    await invoke("clear_sessdata");
  } catch (e) {
    console.warn(e);
  }
  await refreshLoginUi();
}

function openSyncModal() {
  const m = document.getElementById("sync-modal");
  if (!m) return;
  m.hidden = false;
  const prog = document.getElementById("sync-progress");
  const result = document.getElementById("sync-result");
  if (prog) prog.hidden = true;
  if (result) {
    result.hidden = true;
    result.className = "sync-result";
    result.textContent = "";
  }
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
        el.textContent = "尚未同步过（建议先做一次全量同步）";
      }
    }
  } catch {
    if (el) el.textContent = "尚未同步过";
  }
}

function updateProgressUI({ pages, fetched, newest, oldest }) {
  const prog = document.getElementById("sync-progress");
  if (prog) prog.hidden = false;
  const set = (id, v) => {
    const n = document.getElementById(id);
    if (n) n.textContent = String(v);
  };
  set("sync-stat-fetched", fetched);
  set("sync-stat-pages", pages);
  set("sync-stat-newest", newest || "—");
  const tip = document.getElementById("sync-progress-tip");
  if (tip) {
    tip.textContent = oldest
      ? `已回溯到 ${new Date(oldest * 1000).toLocaleString()} 的观看记录`
      : "正在获取第一页数据…";
  }
}

async function runSync() {
  const full = document.querySelector('input[name="sync-mode"]:checked')?.value === "full";
  const startBtn = document.getElementById("sync-start");
  const result = document.getElementById("sync-result");
  const meta = bili().fileMeta;
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.textContent = "同步中…";
  }
  if (result) result.hidden = true;

  try {
    const st = await invoke("get_login_status");
    if (!st?.logged_in) {
      closeSyncModal();
      openLoginModal();
      throw new Error("请先登录（配置 SESSDATA）");
    }

    let max = 0;
    let viewAt = 0;
    let pages = 0;
    let fetched = 0;
    const all = [];
    const watermark = full ? 0 : (await invoke("get_sync_meta"))?.watermark_view_at || 0;
    const maxPages = full ? 200 : 80;

    updateProgressUI({ pages: 0, fetched: 0, newest: 0, oldest: 0 });

    for (let i = 0; i < maxPages; i++) {
      const page = await invoke("fetch_history_page", { max, viewAt });
      const list = page?.items || [];
      if (!list.length) break;
      pages += 1;
      fetched += list.length;
      for (const it of list) all.push(it);
      max = page.cursor_max || 0;
      viewAt = page.cursor_view_at || 0;
      const times = list.map((x) => Number(x.view_at) || 0).filter((t) => t > 0);
      const oldest = times.length ? Math.min(...times) : 0;
      const newest = times.length ? Math.max(...times) : 0;
      updateProgressUI({ pages, fetched, newest, oldest });

      if (page.is_end) break;
      if (!full && watermark > 0 && oldest > 0 && oldest < watermark) break;
      await new Promise((r) => setTimeout(r, 800));
    }

    await invoke("save_sync_meta", {
      watermarkViewAt: all.reduce((m, x) => Math.max(m, Number(x.view_at) || 0), watermark || 0),
      lastSyncAt: Date.now(),
    });

    const empty = {
      formatVersion: 2,
      exportedAt: new Date().toISOString(),
      history: all,
      historyEvents: [],
      historyTombstones: [],
      likedMusic: [],
      favFolders: [],
      favResources: [],
      subscribedCollections: [],
      subscribedCollectionResources: [],
    };
    const b = bili();
    const prev = b.pack;
    const pack = prev
      ? { ...prev, history: all, exportedAt: empty.exportedAt }
      : empty;
    b.pack = pack;
    b.sourceName = `B站同步 · ${st.uname || ""} · ${all.length} 条`;
    if (meta) {
      meta.textContent =
        b.sourceName +
        "\n历史 " +
        pack.history.length +
        " · 收藏 " +
        (pack.favFolders?.length || 0) +
        " · 音乐 " +
        (pack.likedMusic?.length || 0);
    }
    if (typeof b.resetAndRender === "function") b.resetAndRender();
    else if (typeof b.render === "function") b.render();

    if (result) {
      result.hidden = false;
      result.className = "sync-result ok";
      result.textContent = `${full ? "全量" : "增量"}同步完成：共拉取 ${fetched} 条（${pages} 页）`;
    }
    await refreshSyncMeta();
  } catch (e) {
    const msg = e?.message || String(e);
    if (result) {
      result.hidden = false;
      result.className = "sync-result err";
      result.textContent = "同步失败：" + msg;
    }
    if (meta) meta.textContent = "同步失败：" + msg;
  } finally {
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = "开始同步";
    }
  }
}

async function onToolbarSync() {
  const st = await refreshLoginUi();
  if (!st?.logged_in) {
    openLoginModal();
    return;
  }
  openSyncModal();
}

document.getElementById("btn-login")?.addEventListener("click", openLoginModal);
document.getElementById("btn-sync-history")?.addEventListener("click", () => void onToolbarSync());
document.getElementById("login-close")?.addEventListener("click", closeLoginModal);
document.getElementById("login-cancel")?.addEventListener("click", closeLoginModal);
document.getElementById("login-save")?.addEventListener("click", () => void saveLogin());
document.getElementById("login-logout")?.addEventListener("click", () => void clearLogin());
document.getElementById("login-modal")?.addEventListener("click", (e) => {
  if (e.target?.id === "login-modal") closeLoginModal();
});
document.getElementById("sync-close")?.addEventListener("click", closeSyncModal);
document.getElementById("sync-cancel")?.addEventListener("click", closeSyncModal);
document.getElementById("sync-start")?.addEventListener("click", () => void runSync());
document.getElementById("sync-modal")?.addEventListener("click", (e) => {
  if (e.target?.id === "sync-modal") closeSyncModal();
});

void refreshLoginUi();
