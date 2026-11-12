/** B 站登录 + 历史同步（桌面端） */

function bili() {
  return globalThis.__bili || {};
}

function setStatus(text) {
  const el = document.getElementById("login-status");
  if (el) el.textContent = text;
}

async function invoke(cmd, args) {
  const { invoke: inv } = await import("@tauri-apps/api/core");
  return inv(cmd, args);
}

async function refreshLoginUi() {
  const btn = document.getElementById("btn-login");
  try {
    const st = await invoke("get_login_status");
    if (st?.logged_in) {
      const name = st.uname || "已登录";
      if (btn) btn.textContent = name.length > 8 ? name.slice(0, 8) + "…" : name;
      setStatus(`当前：已登录 ${name}${st.mid ? " (mid " + st.mid + ")" : ""}`);
      return st;
    }
  } catch (e) {
    console.warn("[sync] get_login_status", e);
  }
  if (btn) btn.textContent = "登录";
  setStatus("当前：未登录");
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
    setStatus("请粘贴 SESSDATA");
    return;
  }
  setStatus("正在验证…");
  try {
    const st = await invoke("save_sessdata", { sessdata });
    setStatus(`验证成功：${st.uname || "已登录"}`);
    if (ta) ta.value = "";
    await refreshLoginUi();
    setTimeout(closeLoginModal, 600);
  } catch (e) {
    setStatus("验证失败：" + (e?.message || String(e)));
  }
}

async function clearLogin() {
  try {
    await invoke("clear_sessdata");
  } catch (e) {
    console.warn(e);
  }
  await refreshLoginUi();
  setStatus("当前：未登录");
}

async function syncHistory() {
  const btn = document.getElementById("btn-sync-history");
  const meta = bili().fileMeta;
  if (btn) {
    btn.classList.add("is-busy");
    btn.querySelector("span") && (btn.querySelector("span").textContent = "同步中…");
  }
  if (meta) meta.textContent = "正在从 B 站拉取历史…";
  try {
    const st = await invoke("get_login_status");
    if (!st?.logged_in) {
      openLoginModal();
      throw new Error("请先登录（配置 SESSDATA）");
    }
    const result = await invoke("fetch_history", { maxPages: 80 });
    const items = result?.items || [];
    const empty = {
      formatVersion: 2,
      exportedAt: new Date().toISOString(),
      history: items,
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
      ? { ...prev, history: items, exportedAt: empty.exportedAt }
      : empty;
    b.pack = pack;
    b.sourceName = `B站同步 · ${result?.uname || st.uname || ""} · ${items.length} 条`;
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
  } catch (e) {
    const msg = e?.message || String(e);
    if (meta) meta.textContent = "同步失败：" + msg;
    alert("同步失败：" + msg);
  } finally {
    if (btn) {
      btn.classList.remove("is-busy");
      const sp = btn.querySelector("span");
      if (sp) sp.textContent = "同步历史";
    }
  }
}

document.getElementById("btn-login")?.addEventListener("click", openLoginModal);
document.getElementById("btn-sync-history")?.addEventListener("click", () => void syncHistory());
document.getElementById("login-close")?.addEventListener("click", closeLoginModal);
document.getElementById("login-cancel")?.addEventListener("click", closeLoginModal);
document.getElementById("login-save")?.addEventListener("click", () => void saveLogin());
document.getElementById("login-logout")?.addEventListener("click", () => void clearLogin());
document.getElementById("login-modal")?.addEventListener("click", (e) => {
  if (e.target?.id === "login-modal") closeLoginModal();
});

void refreshLoginUi();
