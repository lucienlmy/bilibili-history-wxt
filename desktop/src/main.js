/** @typedef {{ formatVersion?: number, exportedAt?: string, history?: any[], historyEvents?: any[], historyTombstones?: any[], likedMusic?: any[], favFolders?: any[], favResources?: any[], subscribedCollections?: any[], subscribedCollectionResources?: any[] }} BackupPack */

let pack = /** @type {BackupPack|null} */ (null);
let page = "history";
let activeFolderId = null;
let search = "";
let sort = "time-desc";
let sourceName = "";

const contentEl = document.getElementById("content");
const pageTitle = document.getElementById("page-title");
const pageDesc = document.getElementById("page-desc");
const fileMeta = document.getElementById("file-meta");
const searchEl = document.getElementById("search");
const sortEl = document.getElementById("sort");

const PAGE_META = {
  history: ["历史记录", "按备份中的观看历史展示"],
  favorites: ["收藏夹", "收藏夹与收藏资源（来自备份）"],
  music: ["喜欢的音乐", "备份中的 likedMusic"],
  collections: ["订阅合集", "订阅合集与合集视频"],
  about: ["关于", "桌面只读查看器"],
};

function normalizeBackup(raw) {
  if (Array.isArray(raw)) {
    return {
      formatVersion: 1,
      exportedAt: "",
      history: raw,
      historyEvents: [],
      historyTombstones: [],
      likedMusic: [],
      favFolders: [],
      favResources: [],
      subscribedCollections: [],
      subscribedCollectionResources: [],
    };
  }
  if (raw && typeof raw === "object") {
    return {
      formatVersion: raw.formatVersion || 2,
      exportedAt: raw.exportedAt || "",
      history: raw.history || [],
      historyEvents: raw.historyEvents || [],
      historyTombstones: raw.historyTombstones || [],
      likedMusic: raw.likedMusic || [],
      favFolders: raw.favFolders || [],
      favResources: raw.favResources || [],
      subscribedCollections: raw.subscribedCollections || [],
      subscribedCollectionResources: raw.subscribedCollectionResources || [],
    };
  }
  throw new Error("无法识别的备份格式");
}

function fmtTime(sec) {
  if (!sec) return "-";
  const d = new Date(Number(sec) * 1000);
  if (Number.isNaN(d.getTime())) return "-";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function businessLabel(b) {
  const map = {
    archive: "投稿",
    pgc: "番剧/影视",
    article: "专栏",
    "article-list": "文集",
    live: "直播",
    cheese: "课堂",
  };
  return map[b] || b || "视频";
}

function historyUrl(item) {
  if (item.uri) return item.uri.startsWith("http") ? item.uri : `https:${item.uri}`;
  if (item.bvid) return `https://www.bilibili.com/video/${item.bvid}`;
  if (item.bv_id) return `https://www.bilibili.com/video/${item.bv_id}`;
  return "https://www.bilibili.com";
}

function matchText(item, q) {
  if (!q) return true;
  const blob = [
    item.title,
    item.author_name,
    item.author,
    item.bvid,
    item.bv_id,
    item.upper?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return blob.includes(q);
}

function sortItems(items, timeKey) {
  const arr = [...items];
  if (sort === "title") {
    arr.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "zh"));
  } else if (sort === "time-asc") {
    arr.sort((a, b) => (a[timeKey] || 0) - (b[timeKey] || 0));
  } else {
    arr.sort((a, b) => (b[timeKey] || 0) - (a[timeKey] || 0));
  }
  return arr;
}

function statsRow(entries) {
  return `<div class="stats">${entries
    .map(([n, label]) => `<div class="stat"><b>${n}</b><span>${label}</span></div>`)
    .join("")}</div>`;
}

function renderHistory() {
  const q = search.trim().toLowerCase();
  let items = pack?.history || [];
  items = items.filter((x) => matchText(x, q));
  items = sortItems(items, "view_at");
  const html = items
    .slice(0, 500)
    .map((item) => {
      const cover = item.cover || "";
      return `<article class="card">
        <img class="cover" src="${escapeAttr(cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.opacity=.2" />
        <div class="card-body">
          <h3 class="card-title"><a href="${escapeAttr(historyUrl(item))}" target="_blank" rel="noreferrer">${escapeHtml(item.title || "(无标题)")}</a></h3>
          <div class="meta">
            <span class="tag">${escapeHtml(businessLabel(item.business))}</span>
            <span>${escapeHtml(item.author_name || "-")}</span>
            <span>${fmtTime(item.view_at)}</span>
            <span>${escapeHtml(item.bvid || "")}</span>
          </div>
        </div>
      </article>`;
    })
    .join("");
  contentEl.innerHTML =
    statsRow([
      [pack?.history?.length || 0, "历史条目"],
      [pack?.historyEvents?.length || 0, "观看事件"],
      [items.length, "当前筛选"],
    ]) +
    (items.length
      ? `<div class="list">${html}</div>${items.length > 500 ? `<p class="muted">仅显示前 500 条，请用搜索缩小范围</p>` : ""}`
      : `<div class="empty">没有匹配的历史记录</div>`);
}

function renderFavorites() {
  const folders = pack?.favFolders || [];
  const resources = pack?.favResources || [];
  if (activeFolderId == null) {
    contentEl.innerHTML =
      statsRow([
        [folders.length, "收藏夹"],
        [resources.length, "收藏资源"],
      ]) +
      (folders.length
        ? `<div class="folder-grid">${folders
            .map(
              (f) => `<button type="button" class="folder" data-folder="${f.id}">
                <h3>${escapeHtml(f.title || "未命名收藏夹")}</h3>
                <p>${Number(f.media_count || 0)} 个内容 · mid ${f.mid || "-"}</p>
              </button>`
            )
            .join("")}</div>`
        : `<div class="empty">备份中没有收藏夹数据</div>`);
    contentEl.querySelectorAll("[data-folder]").forEach((el) => {
      el.addEventListener("click", () => {
        activeFolderId = Number(el.getAttribute("data-folder"));
        render();
      });
    });
    return;
  }
  const folder = folders.find((f) => Number(f.id) === Number(activeFolderId));
  const q = search.trim().toLowerCase();
  let items = resources.filter((r) => Number(r.folder_id) === Number(activeFolderId));
  items = items.filter((x) => matchText(x, q));
  items = sortItems(items, "fav_time");
  contentEl.innerHTML = `
    <div class="toolbar-inline"><button type="button" class="btn" id="back-folders">← 返回收藏夹列表</button></div>
    ${statsRow([[items.length, folder?.title || "当前收藏夹"]])}
    <div class="list">${items
      .slice(0, 500)
      .map((item) => {
        const bvid = item.bvid || item.bv_id || "";
        const url = bvid ? `https://www.bilibili.com/video/${bvid}` : item.link || "#";
        return `<article class="card">
          <img class="cover" src="${escapeAttr(item.cover || "")}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.opacity=.2" />
          <div class="card-body">
            <h3 class="card-title"><a href="${escapeAttr(url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title || "(无标题)")}</a></h3>
            <div class="meta">
              <span>${escapeHtml(item.upper?.name || "-")}</span>
              <span>收藏 ${fmtTime(item.fav_time)}</span>
              <span>${escapeHtml(bvid)}</span>
            </div>
          </div>
        </article>`;
      })
      .join("") || '<div class="empty">该收藏夹没有资源</div>'}</div>`;
  document.getElementById("back-folders")?.addEventListener("click", () => {
    activeFolderId = null;
    render();
  });
}

function renderMusic() {
  const q = search.trim().toLowerCase();
  let items = pack?.likedMusic || [];
  items = items.filter((x) => matchText(x, q));
  items = sortItems(items, "added_at");
  contentEl.innerHTML =
    statsRow([[pack?.likedMusic?.length || 0, "喜欢的音乐"], [items.length, "当前筛选"]]) +
    (items.length
      ? `<div class="list">${items
          .map((item) => {
            const url = item.bvid ? `https://www.bilibili.com/video/${item.bvid}` : "#";
            return `<article class="card">
              <img class="cover" src="${escapeAttr(item.pic || "")}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.opacity=.2" />
              <div class="card-body">
                <h3 class="card-title"><a href="${escapeAttr(url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title || "(无标题)")}</a></h3>
                <div class="meta">
                  <span>${escapeHtml(item.author || "-")}</span>
                  <span>添加 ${fmtTime(item.added_at)}</span>
                  <span>${escapeHtml(item.bvid || "")}</span>
                </div>
              </div>
            </article>`;
          })
          .join("")}</div>`
      : `<div class="empty">备份中没有喜欢的音乐</div>`);
}

function renderCollections() {
  const cols = pack?.subscribedCollections || [];
  const resources = pack?.subscribedCollectionResources || [];
  contentEl.innerHTML =
    statsRow([
      [cols.length, "订阅合集"],
      [resources.length, "合集视频"],
    ]) +
    (cols.length
      ? `<div class="folder-grid">${cols
          .map(
            (c) => `<div class="folder">
              <h3>${escapeHtml(c.title || "未命名合集")}</h3>
              <p>${Number(c.media_count || 0)} 个内容 · ${escapeHtml(c.upper?.name || "")}</p>
            </div>`
          )
          .join("")}</div>`
      : `<div class="empty">备份中没有订阅合集</div>`);
}

function renderAbout() {
  contentEl.innerHTML = `<div class="about">
    <h2>桌面只读查看器</h2>
    <p>界面复刻扩展主布局：侧边栏 + 内容区。数据<strong>仅来自</strong>浏览器扩展导出的备份 JSON，不登录 B 站、不同步、不写回。</p>
    <ul>
      <li>兼容 <code>formatVersion: 2</code> 完整备份包</li>
      <li>兼容旧版顶层 <code>HistoryItem[]</code></li>
      <li>支持历史 / 收藏夹 / 喜欢的音乐 / 订阅合集</li>
    </ul>
    <p>当前文件：${escapeHtml(sourceName || "未加载")}</p>
    <p>导出时间：${escapeHtml(pack?.exportedAt || "-")}</p>
  </div>`;
}

function renderEmpty() {
  contentEl.innerHTML = `<div class="empty">
    <p>请点击左侧「打开备份 JSON」</p>
    <p>选择扩展导出的 bilibili-history-*.json</p>
  </div>`;
}

function render() {
  const meta = PAGE_META[page] || PAGE_META.history;
  pageTitle.textContent = meta[0];
  pageDesc.textContent = meta[1];
  if (!pack) {
    renderEmpty();
    return;
  }
  if (page === "history") renderHistory();
  else if (page === "favorites") renderFavorites();
  else if (page === "music") renderMusic();
  else if (page === "collections") renderCollections();
  else renderAbout();
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&")
    .replaceAll("<", "<")
    .replaceAll(">", ">")
    .replaceAll('"', """);
}
function escapeAttr(s) {
  return escapeHtml(s).replaceAll("'", "&#39;");
}

async function openBackup() {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const selected = await open({
      multiple: false,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!selected) return;
    const path = typeof selected === "string" ? selected : selected.path || selected;
    const text = await readTextFile(path);
    const raw = JSON.parse(text);
    pack = normalizeBackup(raw);
    sourceName = String(path).split(/[/\\]/).pop() || String(path);
    activeFolderId = null;
    fileMeta.textContent = `${sourceName}\n历史 ${pack.history.length} · 收藏夹 ${pack.favFolders.length} · 音乐 ${pack.likedMusic.length}`;
    render();
  } catch (err) {
    if (String(err).includes("Tauri") || String(err).includes("import")) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const text = await file.text();
        pack = normalizeBackup(JSON.parse(text));
        sourceName = file.name;
        activeFolderId = null;
        fileMeta.textContent = `${sourceName}\n历史 ${pack.history.length} · 收藏夹 ${pack.favFolders.length} · 音乐 ${pack.likedMusic.length}`;
        render();
      };
      input.click();
      return;
    }
    fileMeta.textContent = "加载失败：" + (err?.message || String(err));
  }
}

document.getElementById("nav").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-page]");
  if (!btn) return;
  page = btn.getAttribute("data-page");
  activeFolderId = null;
  document.querySelectorAll(".nav-item").forEach((el) => el.classList.toggle("active", el === btn));
  render();
});
document.getElementById("btn-open").addEventListener("click", () => void openBackup());
searchEl.addEventListener("input", () => {
  search = searchEl.value;
  render();
});
sortEl.addEventListener("change", () => {
  sort = sortEl.value;
  render();
});

render();
