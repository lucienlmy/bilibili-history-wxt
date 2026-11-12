/** Desktop offline backup viewer — UI aligned with extension */

let pack = null;
let page = "history";
let activeFolderId = null;
let search = "";
let sort = "time-desc";
let typeFilter = "all";
let cols = "4";
let sourceName = "";
let collapsed = false;

const contentEl = document.getElementById("content");
const pageTitle = document.getElementById("page-title");
const pageDesc = document.getElementById("page-desc");
const pageCount = document.getElementById("page-count");
const fileMeta = document.getElementById("file-meta");
const searchEl = document.getElementById("search");
const sortEl = document.getElementById("sort");
const typeEl = document.getElementById("type-filter");
const colsEl = document.getElementById("cols");
const sidebar = document.getElementById("sidebar");
const navEl = document.getElementById("nav");

const MENUS = [
  { group: "浏览数据", items: [
    { id: "history", title: "历史记录", icon: "history" },
    { id: "favorites", title: "收藏夹", icon: "star" },
    { id: "collections", title: "合集", icon: "library" },
    { id: "music", title: "我喜欢的音乐", icon: "music" },
  ]},
  { group: "更多", items: [
    { id: "about", title: "关于", icon: "info" },
  ]},
];

const PAGE_META = {
  history: ["历史记录", "搜索、筛选并浏览本地备份中的观看记录"],
  favorites: ["收藏夹", "来自备份的收藏夹与资源"],
  music: ["我喜欢的音乐", "备份中的 likedMusic"],
  collections: ["合集", "订阅合集与合集视频"],
  about: ["关于", "桌面只读备份查看器"],
};

const ICONS = {
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  library: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
};

function buildNav() {
  navEl.innerHTML = MENUS.map((g) => {
    const items = g.items.map((it) =>
      `<button type="button" class="nav-item${it.id === page ? " active" : ""}" data-page="${it.id}" title="${it.title}">
        ${ICONS[it.icon] || ""}<span>${it.title}</span>
      </button>`
    ).join("");
    return `<div class="group"><p class="group-label">${g.group}</p>${items}</div>`;
  }).join("");
}

function normalizeBackup(raw) {
  if (Array.isArray(raw)) {
    return {
      formatVersion: 1, exportedAt: "",
      history: raw, historyEvents: [], historyTombstones: [],
      likedMusic: [], favFolders: [], favResources: [],
      subscribedCollections: [], subscribedCollectionResources: [],
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

const dateFmt = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function fmtTime(sec) {
  if (!sec) return "时间未知";
  const d = new Date(Number(sec) * 1000);
  return Number.isNaN(d.getTime()) ? "时间未知" : dateFmt.format(d);
}

function typeTag(b) {
  const map = { archive: "视频", pgc: "番剧", article: "专栏", "article-list": "文集", live: "直播", cheese: "课堂" };
  return map[b] || "视频";
}

function historyUrl(item) {
  if (item.uri) return item.uri.startsWith("http") ? item.uri : `https:${item.uri}`;
  if (item.bvid) return `https://www.bilibili.com/video/${item.bvid}`;
  if (item.bv_id) return `https://www.bilibili.com/video/${item.bv_id}`;
  return "https://www.bilibili.com";
}

function coverSrc(cover) {
  if (!cover) return "";
  if (cover.includes("@")) return cover;
  return `${cover}@760w_428h_1c.avif`;
}

function matchText(item, q) {
  if (!q) return true;
  const blob = [item.title, item.author_name, item.author, item.bvid, item.bv_id, item.upper?.name]
    .filter(Boolean).join(" ").toLowerCase();
  return blob.includes(q);
}

function sortItems(items, timeKey) {
  const arr = [...items];
  if (sort === "title") arr.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "zh"));
  else if (sort === "time-asc") arr.sort((a, b) => (a[timeKey] || 0) - (b[timeKey] || 0));
  else arr.sort((a, b) => (b[timeKey] || 0) - (a[timeKey] || 0));
  return arr;
}

function progressPct(item) {
  if (item.progress === -1) return 100;
  if (!item.progress || !item.duration) return 0;
  return Math.min(100, Math.round((item.progress / item.duration) * 100));
}

function formatDuration(sec) {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** HTML escape without fragile entity literals */
function escapeHtml(s) {
  const map = {
    "&": "\u0026amp;",
    "<": "\u0026lt;",
    ">": "\u0026gt;",
    '"': "\u0026quot;",
    "'": "\u0026#39;",
  };
  return String(s ?? "").replace(/[&<>"']/g, (ch) => map[ch]);
}
function escapeAttr(s) {
  return escapeHtml(s);
}

function gridClass() {
  if (cols === "3") return "grid cols-3";
  if (cols === "4") return "grid cols-4";
  if (cols === "5") return "grid cols-5";
  return "grid";
}

function historyCard(item) {
  const url = historyUrl(item);
  const pct = progressPct(item);
  const tag = typeTag(item.business);
  const progressLabel =
    item.progress === -1
      ? "已看完"
      : item.progress > 0 && item.duration > 0
        ? `${formatDuration(item.progress)} / ${formatDuration(item.duration)} · ${pct}%`
        : "";
  return `<article class="history-card">
    <a class="cover-wrap" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">
      <img src="${escapeAttr(coverSrc(item.cover))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"
        onerror="if(!this.dataset.fb){this.dataset.fb=1;this.src='${escapeAttr(item.cover || "")}';}else{this.style.opacity='.15'}" />
      ${pct > 0 && item.progress !== -1 ? `<div class="progress-track"><div class="progress-bar" style="width:${pct}%"></div></div>` : ""}
      ${progressLabel ? `<span class="badge bottom-left">${escapeHtml(progressLabel)}</span>` : ""}
      ${tag !== "视频" ? `<span class="badge bottom-right">${escapeHtml(tag)}</span>` : ""}
      ${item.progress === -1 ? `<span class="badge top-left">已看完</span>` : ""}
    </a>
    <div class="card-body">
      <h3 class="card-title"><a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" title="${escapeAttr(item.title || "")}">${escapeHtml(item.title || "未命名内容")}</a></h3>
      <div class="card-meta">
        <a href="https://space.bilibili.com/${Number(item.author_mid) || 0}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.author_name || "未知 UP 主")}</a>
        <time>${fmtTime(item.view_at)}</time>
      </div>
    </div>
  </article>`;
}

function renderHistory() {
  const q = search.trim().toLowerCase();
  let items = pack?.history || [];
  if (typeFilter !== "all") items = items.filter((x) => x.business === typeFilter);
  items = items.filter((x) => matchText(x, q));
  items = sortItems(items, "view_at");
  pageCount.textContent = `${pack?.history?.length || 0} 个内容 · 显示 ${Math.min(items.length, 400)}`;
  if (!items.length) {
    contentEl.innerHTML = `<div class="empty">${q || typeFilter !== "all" ? "没有找到匹配的历史记录" : "备份中没有历史记录"}</div>`;
    return;
  }
  const shown = items.slice(0, 400);
  contentEl.innerHTML = `<div class="${gridClass()}">${shown.map(historyCard).join("")}</div>
    ${items.length > 400 ? `<p class="empty" style="margin-top:1.5rem">仅显示前 400 条，请用搜索缩小范围（共 ${items.length}）</p>` : ""}`;
}

function resourceCard(item) {
  const bvid = item.bvid || item.bv_id || "";
  const url = bvid ? `https://www.bilibili.com/video/${bvid}` : item.link || "#";
  return `<article class="history-card">
    <a class="cover-wrap" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">
      <img src="${escapeAttr(coverSrc(item.cover))}" alt="" loading="lazy" referrerpolicy="no-referrer"
        onerror="if(!this.dataset.fb){this.dataset.fb=1;this.src='${escapeAttr(item.cover || "")}';}else{this.style.opacity='.15'}" />
    </a>
    <div class="card-body">
      <h3 class="card-title"><a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title || "未命名内容")}</a></h3>
      <div class="card-meta">
        <span>${escapeHtml(item.upper?.name || item.author || "-")}</span>
        <time>${fmtTime(item.fav_time || item.added_at || item.pubdate)}</time>
      </div>
    </div>
  </article>`;
}

function renderFavorites() {
  const folders = pack?.favFolders || [];
  const resources = pack?.favResources || [];
  if (activeFolderId == null) {
    pageCount.textContent = `${folders.length} 个收藏夹`;
    contentEl.innerHTML = folders.length
      ? `<div class="folder-grid">${folders.map((f) =>
          `<button type="button" class="folder" data-folder="${f.id}">
            <h3>${escapeHtml(f.title || "未命名收藏夹")}</h3>
            <p>${Number(f.media_count || 0)} 个内容</p>
          </button>`).join("")}</div>`
      : `<div class="empty">备份中没有收藏夹数据</div>`;
    contentEl.querySelectorAll("[data-folder]").forEach((el) => {
      el.addEventListener("click", () => { activeFolderId = Number(el.getAttribute("data-folder")); render(); });
    });
    return;
  }
  const folder = folders.find((f) => Number(f.id) === Number(activeFolderId));
  const q = search.trim().toLowerCase();
  let items = resources.filter((r) => Number(r.folder_id) === Number(activeFolderId));
  items = items.filter((x) => matchText(x, q));
  items = sortItems(items, "fav_time");
  pageCount.textContent = folder?.title || "收藏夹";
  contentEl.innerHTML = `<button type="button" class="back-btn" id="back-folders">← 返回收藏夹列表</button>
    <div class="${gridClass()}">${items.slice(0, 400).map(resourceCard).join("") || ""}</div>
    ${!items.length ? `<div class="empty">该收藏夹没有资源</div>` : ""}`;
  document.getElementById("back-folders")?.addEventListener("click", () => { activeFolderId = null; render(); });
}

function renderMusic() {
  const q = search.trim().toLowerCase();
  let items = pack?.likedMusic || [];
  items = items.filter((x) => matchText(x, q));
  items = sortItems(items, "added_at");
  pageCount.textContent = `${pack?.likedMusic?.length || 0} 首`;
  contentEl.innerHTML = items.length
    ? `<div class="${gridClass()}">${items.map((item) => resourceCard({
        ...item, cover: item.pic, upper: { name: item.author }, fav_time: item.added_at,
      })).join("")}</div>`
    : `<div class="empty">备份中没有喜欢的音乐</div>`;
}

function renderCollections() {
  const colsList = pack?.subscribedCollections || [];
  pageCount.textContent = `${colsList.length} 个合集`;
  contentEl.innerHTML = colsList.length
    ? `<div class="folder-grid">${colsList.map((c) =>
        `<div class="folder"><h3>${escapeHtml(c.title || "未命名合集")}</h3>
         <p>${Number(c.media_count || 0)} 个内容 · ${escapeHtml(c.upper?.name || "")}</p></div>`
      ).join("")}</div>`
    : `<div class="empty">备份中没有订阅合集</div>`;
}

function renderAbout() {
  pageCount.textContent = "";
  contentEl.innerHTML = `<div class="about">
    <h2>桌面只读查看器</h2>
    <p>界面按扩展主布局对齐：侧边栏分组、历史卡片网格、观看进度条。数据<strong>仅来自</strong>扩展导出的备份 JSON。</p>
    <ul>
      <li>兼容 formatVersion: 2 完整备份包</li>
      <li>兼容旧版顶层 HistoryItem[]</li>
      <li>不登录 B 站、不同步、不写回</li>
    </ul>
    <p>当前文件：${escapeHtml(sourceName || "未加载")}</p>
    <p>导出时间：${escapeHtml(pack?.exportedAt || "-")}</p>
  </div>`;
}

function renderEmpty() {
  pageCount.textContent = "0";
  contentEl.innerHTML = `<div class="empty"><p>请打开扩展导出的备份 JSON</p><p>支持 bilibili-history-*.json</p></div>`;
}

function render() {
  const meta = PAGE_META[page] || PAGE_META.history;
  pageTitle.textContent = meta[0];
  pageDesc.textContent = meta[1];
  buildNav();
  if (!pack) { renderEmpty(); return; }
  if (page === "history") renderHistory();
  else if (page === "favorites") renderFavorites();
  else if (page === "music") renderMusic();
  else if (page === "collections") renderCollections();
  else renderAbout();
}

async function openBackup() {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const selected = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!selected) return;
    const path = typeof selected === "string" ? selected : selected.path || selected;
    const text = await readTextFile(path);
    pack = normalizeBackup(JSON.parse(text));
    sourceName = String(path).split(/[/\\]/).pop() || String(path);
    activeFolderId = null;
    fileMeta.textContent = sourceName + "\n历史 " + pack.history.length + " · 收藏 " + pack.favFolders.length + " · 音乐 " + pack.likedMusic.length;
    render();
  } catch (err) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        pack = normalizeBackup(JSON.parse(await file.text()));
        sourceName = file.name;
        activeFolderId = null;
        fileMeta.textContent = sourceName + "\n历史 " + pack.history.length + " · 收藏 " + pack.favFolders.length + " · 音乐 " + pack.likedMusic.length;
        render();
      } catch (e) {
        fileMeta.textContent = "加载失败：" + (e?.message || String(e));
      }
    };
    input.click();
  }
}

navEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-page]");
  if (!btn) return;
  page = btn.getAttribute("data-page");
  activeFolderId = null;
  render();
});
document.getElementById("btn-open").addEventListener("click", () => void openBackup());
document.getElementById("btn-open-2").addEventListener("click", () => void openBackup());
document.getElementById("brand-home").addEventListener("click", () => { page = "history"; activeFolderId = null; render(); });
document.getElementById("btn-collapse").addEventListener("click", () => {
  collapsed = !collapsed;
  sidebar.classList.toggle("collapsed", collapsed);
});
document.getElementById("btn-theme").addEventListener("click", () => {
  document.documentElement.classList.toggle("dark");
});
searchEl.addEventListener("input", () => { search = searchEl.value; render(); });
sortEl.addEventListener("change", () => { sort = sortEl.value; render(); });
typeEl.addEventListener("change", () => { typeFilter = typeEl.value; render(); });
colsEl.addEventListener("change", () => { cols = colsEl.value; render(); });

buildNav();
render();
