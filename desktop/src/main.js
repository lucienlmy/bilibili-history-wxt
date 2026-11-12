/** Desktop offline backup viewer — closer to extension UI */

let pack = null;
let page = "history";
let activeFolderId = null;
let activeCollectionId = null;
let search = "";
let searchKind = "all";
let sort = "time-desc";
let typeFilter = "all";
let cols = "4";
let dateStart = "";
let dateEnd = "";
let sourceName = "";
let collapsed = false;
let filtersOpen = true;
let displayMode = "content";
let currentPage = 1;
let PAGE_SIZE = 100;

const contentEl = document.getElementById("content");
const pageTitle = document.getElementById("page-title");
const pageDesc = document.getElementById("page-desc");
const pageCount = document.getElementById("page-count");
const fileMeta = document.getElementById("file-meta");
const searchEl = document.getElementById("search");
const sortEl = document.getElementById("sort");
const typeEl = document.getElementById("type-filter");
const colsEl = document.getElementById("cols");
const searchKindEl = document.getElementById("search-kind");
const dateStartEl = document.getElementById("date-start");
const dateEndEl = document.getElementById("date-end");
const sidebar = document.getElementById("sidebar");
const navEl = document.getElementById("nav");
const filtersEl = document.getElementById("filters");
const paginationEl = document.getElementById("pagination");
const scrollTopBtn = document.getElementById("scroll-top");

const MENUS = [
  { group: "浏览数据", items: [
    { id: "history", title: "历史记录", icon: "history" },
    { id: "favorites", title: "收藏夹", icon: "star" },
    { id: "collections", title: "合集", icon: "library" },
    { id: "ai", title: "AI探索", icon: "sparkles" },
    { id: "music-group", title: "听歌", icon: "music", children: [
      { id: "music-search", title: "搜索" },
      { id: "music", title: "我喜欢的音乐" },
    ]},
  ]},
  { group: "同步与备份", items: [
    { id: "cloud", title: "云同步", icon: "cloud" },
    { id: "video-backup", title: "视频备份", icon: "upload" },
    { id: "backup-group", title: "数据备份", icon: "harddrive", children: [
      { id: "backup-local", title: "本地目录" },
      { id: "backup-webdav", title: "WebDAV" },
      { id: "backup-json", title: "JSON 文件" },
    ]},
  ]},
  { group: "更多", items: [
    { id: "about", title: "关于", icon: "info" },
    { id: "feedback", title: "反馈", icon: "message" },
    { id: "reward", title: "赞赏", icon: "heart" },
    { id: "settings", title: "设置", icon: "settings" },
  ]},
];

const openGroups = new Set(["music-group", "backup-group"]);

const PAGE_META = {
  history: ["历史记录", "搜索、筛选并浏览本地备份中的观看记录"],
  favorites: ["收藏夹", "来自备份的收藏夹与资源"],
  music: ["我喜欢的音乐", "备份中的 likedMusic"],
  collections: ["合集", "订阅合集与合集视频"],
  about: ["关于", "桌面只读备份查看器"],
  ai: ["AI探索", "桌面版仅展示占位，数据来自备份"],
  cloud: ["云同步", "桌面只读版不支持云同步"],
  "video-backup": ["视频备份", "桌面只读版不支持视频备份"],
  "backup-json": ["JSON 文件", "请使用右上角「打开备份」加载 JSON"],
  feedback: ["反馈", "桌面只读版无反馈入口"],
  reward: ["赞赏", "桌面只读版占位页"],
  settings: ["设置", "部分视图设置可在历史页使用"],
  "music-search": ["搜索音乐", "桌面只读版不提供在线搜索"],
  "backup-local": ["本地目录", "桌面只读版请直接打开备份 JSON"],
  "backup-webdav": ["WebDAV", "桌面只读版不支持 WebDAV"],
};

const ICONS = {
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  library: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
  sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.5 2A4 4 0 0 0 6 19z"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4"/><path d="M8 8l4-4 4 4"/><path d="M4 20h16"/></svg>',
  harddrive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h.01M10 12h.01"/></svg>',
  message: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>',
};

function buildNav() {
  const childActiveParent = (it) => (it.children || []).some((c) => c.id === page);
  navEl.innerHTML = MENUS.map((g) => {
    const items = g.items.map((it) => {
      if (it.children && it.children.length) {
        const open = openGroups.has(it.id) || childActiveParent(it);
        if (childActiveParent(it)) openGroups.add(it.id);
        const kids = it.children.map((c) =>
          `<button type="button" class="nav-sub${c.id === page ? " active" : ""}" data-page="${c.id}">${c.title}</button>`
        ).join("");
        return `<div class="nav-expand${open ? " open" : ""}" data-group="${it.id}">
          <button type="button" class="nav-item nav-parent${childActiveParent(it) ? " active" : ""}" data-toggle="${it.id}" title="${it.title}">
            ${ICONS[it.icon] || ""}<span>${it.title}</span>
            <svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <div class="nav-children">${kids}</div>
        </div>`;
      }
      return `<button type="button" class="nav-item${it.id === page ? " active" : ""}" data-page="${it.id}" title="${it.title}">
        ${ICONS[it.icon] || ""}<span>${it.title}</span>
      </button>`;
    }).join("");
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
  return cover + "@760w_428h_1c.avif";
}

function matchText(item, q) {
  if (!q) return true;
  const title = String(item.title || "").toLowerCase();
  const up = String(item.author_name || item.author || item.upper?.name || "").toLowerCase();
  const bvid = String(item.bvid || item.bv_id || "").toLowerCase();
  if (searchKind === "title") return title.includes(q);
  if (searchKind === "up") return up.includes(q);
  if (searchKind === "bvid") return bvid.includes(q);
  return title.includes(q) || up.includes(q) || bvid.includes(q);
}

function inDateRange(sec) {
  if (!sec) return !dateStart && !dateEnd;
  const t = Number(sec) * 1000;
  if (dateStart) {
    const start = new Date(dateStart + "T00:00:00").getTime();
    if (t < start) return false;
  }
  if (dateEnd) {
    const end = new Date(dateEnd + "T23:59:59").getTime();
    if (t > end) return false;
  }
  return true;
}

function sortItems(items, timeKey) {
  const arr = items.slice();
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
  if (h) return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  return m + ":" + String(s).padStart(2, "0");
}

function escapeHtml(s) {
  const map = { "&": "\u0026amp;", "<": "\u0026lt;", ">": "\u0026gt;", '"': "\u0026quot;", "'": "\u0026#39;" };
  return String(s ?? "").replace(/[&<>"']/g, (ch) => map[ch]);
}
function escapeAttr(s) { return escapeHtml(s); }

function skeletonHtml() {
  const cards = Array.from({ length: 8 }, () =>
    `<div class="skeleton-card"><div class="skeleton-cover"></div><div class="skeleton-line"></div><div class="skeleton-line short"></div></div>`
  ).join("");
  return `<div class="skeleton-grid">${cards}</div>`;
}

function hasActiveFilters() {
  return Boolean(search.trim() || dateStart || dateEnd) || typeFilter !== "all" || searchKind !== "all" || sort !== "time-desc";
}

function updateClearBtn() {
  const btn = document.getElementById("btn-clear-filters");
  if (!btn) return;
  btn.hidden = !(page === "history" || page === "favorites" || page === "music") || !hasActiveFilters();
}

function clearFilters() {
  search = ""; searchKind = "all"; typeFilter = "all"; sort = "time-desc"; dateStart = ""; dateEnd = "";
  if (searchEl) searchEl.value = "";
  if (searchKindEl) searchKindEl.value = "all";
  if (typeEl) typeEl.value = "all";
  if (sortEl) sortEl.value = "time-desc";
  if (dateStartEl) dateStartEl.value = "";
  if (dateEndEl) dateEndEl.value = "";
  resetAndRender();
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
    item.progress === -1 ? "已看完"
      : item.progress > 0 && item.duration > 0
        ? formatDuration(item.progress) + " / " + formatDuration(item.duration) + " · " + pct + "%"
        : "";
  return `<article class="history-card">
    <a class="cover-wrap" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">
      <img src="${escapeAttr(coverSrc(item.cover))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"
        onerror="if(!this.dataset.fb){this.dataset.fb=1;this.src='${escapeAttr(item.cover || "")}';}else{this.style.opacity='.15'}" />
      ${pct > 0 && item.progress !== -1 ? `<div class="progress-track"><div class="progress-bar" style="width:${pct}%"></div></div>` : ""}
      ${progressLabel ? `<span class="badge bottom-left">${escapeHtml(progressLabel)}</span>` : ""}
      ${tag !== "视频" ? `<span class="badge bottom-right">${escapeHtml(tag)}</span>` : ""}
      ${item.progress === -1 ? `<span class="badge top-left">已看完</span>` : ""}
      ${item.is_fav ? `<span class="badge" style="right:0.5rem;top:0.5rem">已收藏</span>` : ""}
    </a>
    <div class="card-body">
      <div class="card-title-row">
        <h3 class="card-title"><a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer" title="${escapeAttr(item.title || "")}">${escapeHtml(item.title || "未命名内容")}</a></h3>
        <span class="card-action" title="桌面只读，不可删除" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>
        </span>
      </div>
      <div class="card-meta">
        <a href="https://space.bilibili.com/${Number(item.author_mid) || 0}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.author_name || "未知 UP 主")}</a>
        <time>${fmtTime(item.view_at)}</time>
      </div>
    </div>
  </article>`;
}

function resourceCard(item) {
  const bvid = item.bvid || item.bv_id || "";
  const url = bvid ? "https://www.bilibili.com/video/" + bvid : (item.link || "#");
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

function renderPagination(total) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total <= PAGE_SIZE) { paginationEl.hidden = true; paginationEl.innerHTML = ""; return; }
  paginationEl.hidden = false;
  const pages = [];
  pages.push(`<button type="button" data-pg="${currentPage - 1}" ${currentPage <= 1 ? "disabled" : ""}>‹ 上一页</button>`);
  const nums = [];
  if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) nums.push(i); }
  else {
    nums.push(1);
    let start = Math.max(2, currentPage - 1);
    let end = Math.min(totalPages - 1, currentPage + 1);
    if (currentPage < 4) end = 4;
    if (currentPage > totalPages - 3) start = totalPages - 3;
    if (start > 2) nums.push("…");
    for (let i = start; i <= end; i++) nums.push(i);
    if (end < totalPages - 1) nums.push("…");
    nums.push(totalPages);
  }
  for (const n of nums) {
    if (n === "…") pages.push(`<span class="pg-info">…</span>`);
    else pages.push(`<button type="button" data-pg="${n}" class="${n === currentPage ? "active" : ""}">${n}</button>`);
  }
  pages.push(`<button type="button" data-pg="${currentPage + 1}" ${currentPage >= totalPages ? "disabled" : ""}>下一页 ›</button>`);
  pages.push(`<span class="pg-info">共 ${totalPages} 页 / ${total} 个</span>`);
  pages.push(`<span class="pg-jump">跳至 <input id="pg-jump-input" type="number" min="1" max="${totalPages}" /> 页</span>`);
  paginationEl.innerHTML = pages.join("");
  const jump = document.getElementById("pg-jump-input");
  if (jump) {
    const go = () => {
      const n = Number(jump.value);
      if (n >= 1 && n <= totalPages) { currentPage = n; render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
    };
    jump.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    jump.addEventListener("change", go);
  }
}

function getFilteredHistory() {
  const q = search.trim().toLowerCase();
  let items = displayMode === "visit" && (pack?.historyEvents || []).length
    ? pack.historyEvents.slice() : (pack?.history || []).slice();
  if (typeFilter !== "all") items = items.filter((x) => x.business === typeFilter);
  items = items.filter((x) => matchText(x, q) && inDateRange(x.view_at));
  return sortItems(items, "view_at");
}

function renderHistory() {
  const items = getFilteredHistory();
  pageCount.textContent = items.length + " 个内容";
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const shown = items.slice(start, start + PAGE_SIZE);
  if (!shown.length) {
    contentEl.innerHTML = `<div class="empty"><p>没有匹配的历史记录</p>${hasActiveFilters() ? `<p><button type="button" class="empty-cta" id="empty-clear">清除筛选</button></p>` : ""}</div>`;
    document.getElementById("empty-clear")?.addEventListener("click", clearFilters);
    paginationEl.hidden = true;
    return;
  }
  contentEl.innerHTML = `<div class="${gridClass()}">${shown.map(historyCard).join("")}</div>`;
  renderPagination(items.length);
}

function getFilteredFavResources() {
  const q = search.trim().toLowerCase();
  let items = (pack?.favResources || []).slice();
  if (activeFolderId != null) items = items.filter((x) => String(x.media_id || x.folder_id || "") === String(activeFolderId));
  items = items.filter((x) => matchText(x, q) && inDateRange(x.fav_time || x.added_at || x.pubdate));
  return sortItems(items, "fav_time");
}

function renderFavorites() {
  const folders = pack?.favFolders || [];
  if (!folders.length && !(pack?.favResources || []).length) {
    pageCount.textContent = "0 个内容";
    contentEl.innerHTML = `<div class="empty"><p>备份中没有收藏夹数据</p></div>`;
    paginationEl.hidden = true;
    return;
  }
  if (activeFolderId == null && folders[0]) activeFolderId = folders[0].id ?? folders[0].media_id ?? folders[0].fid;
  const items = getFilteredFavResources();
  pageCount.textContent = items.length + " 个内容";
  const folderHtml = folders.map((f) => {
    const id = f.id ?? f.media_id ?? f.fid;
    const active = String(id) === String(activeFolderId);
    const count = (pack.favResources || []).filter((x) => String(x.media_id || x.folder_id || "") === String(id)).length;
    return `<div class="fav-folder-item${active ? " active" : ""}">
      <button type="button" class="fav-folder-main" data-folder="${escapeAttr(String(id))}">
        <h3>${escapeHtml(f.title || f.name || "未命名收藏夹")}</h3>
        <p>${count} 个内容</p>
      </button>
      <button type="button" class="fav-folder-more" title="只读" disabled>···</button>
    </div>`;
  }).join("");
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const shown = items.slice(start, start + PAGE_SIZE);
  const grid = shown.length
    ? `<div class="${gridClass()}">${shown.map(resourceCard).join("")}</div>`
    : `<div class="empty"><p>此收藏夹暂无内容</p></div>`;
  contentEl.innerHTML = `<div class="fav-layout">
    <aside class="fav-folders">
      <div class="fav-folders-head"><span class="fav-head-title">收藏夹</span><button type="button" class="fav-sync-all" disabled>同步全部</button></div>
      ${folderHtml || `<div class="empty" style="margin:1rem"><p>无收藏夹</p></div>`}
    </aside>
    <div class="fav-main">${grid}</div>
  </div>`;
  contentEl.querySelectorAll("[data-folder]").forEach((btn) => {
    btn.addEventListener("click", () => { activeFolderId = btn.getAttribute("data-folder"); currentPage = 1; render(); });
  });
  renderPagination(items.length);
}

function renderMusic() {
  const q = search.trim().toLowerCase();
  let items = (pack?.likedMusic || []).slice();
  items = items.filter((x) => matchText(x, q));
  items = sortItems(items, "fav_time");
  pageCount.textContent = items.length + " 首";
  if (!items.length) {
    contentEl.innerHTML = `<div class="empty"><p>备份中没有喜欢的音乐</p></div>`;
    paginationEl.hidden = true;
    return;
  }
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const shown = items.slice(start, start + PAGE_SIZE);
  const rows = shown.map((item) => {
    const bvid = item.bvid || item.bv_id || "";
    const url = bvid ? "https://www.bilibili.com/video/" + bvid : (item.link || "#");
    return `<article class="music-row">
      <img class="music-cover" src="${escapeAttr(coverSrc(item.cover))}" alt="" loading="lazy" referrerpolicy="no-referrer"
        onerror="this.style.opacity='.2'" />
      <div class="music-body">
        <h3 class="music-title"><a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title || "未命名")}</a></h3>
        <div class="music-sub">
          <span>${escapeHtml(item.upper?.name || item.author || "-")}</span>
          <time>${fmtTime(item.fav_time || item.pubdate)}</time>
        </div>
      </div>
    </article>`;
  }).join("");
  contentEl.innerHTML = `<div class="music-page">
    <div class="music-player-bar">
      <div class="music-player-left">
        <h2>我喜欢的音乐</h2>
        <div class="music-controls"><button type="button" class="music-play" disabled title="桌面只读">▶</button></div>
      </div>
      <p class="music-player-hint">桌面只读版不播放音频，点击标题可在浏览器打开</p>
    </div>
    <div class="music-list">${rows}</div>
  </div>`;
  renderPagination(items.length);
}

function renderCollections() {
  const colsList = pack?.subscribedCollections || [];
  const resources = pack?.subscribedCollectionResources || [];
  if (activeCollectionId != null) {
    const col = colsList.find((c) => String(c.id || c.season_id) === String(activeCollectionId));
    let items = resources.filter((x) => String(x.season_id || x.collection_id || "") === String(activeCollectionId));
    const q = search.trim().toLowerCase();
    items = items.filter((x) => matchText(x, q));
    items = sortItems(items, "pubdate");
    pageCount.textContent = items.length + " 个内容";
    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    const start = (currentPage - 1) * PAGE_SIZE;
    const shown = items.slice(start, start + PAGE_SIZE);
    contentEl.innerHTML = `
      <button type="button" class="collection-back" id="col-back">← 返回合集列表</button>
      <h2 style="margin:0 0 1rem;font-size:1.1rem">${escapeHtml(col?.title || col?.name || "合集")}</h2>
      ${shown.length ? `<div class="${gridClass()}">${shown.map(resourceCard).join("")}</div>` : `<div class="empty"><p>此合集暂无内容</p></div>`}`;
    document.getElementById("col-back")?.addEventListener("click", () => { activeCollectionId = null; currentPage = 1; render(); });
    renderPagination(items.length);
    return;
  }
  pageCount.textContent = colsList.length + " 个合集";
  if (!colsList.length) {
    contentEl.innerHTML = `<div class="empty"><p>备份中没有合集数据</p></div>`;
    paginationEl.hidden = true;
    return;
  }
  contentEl.innerHTML = `<div class="folder-grid">${colsList.map((c) => {
    const id = c.id ?? c.season_id;
    const count = resources.filter((x) => String(x.season_id || x.collection_id || "") === String(id)).length;
    return `<button type="button" class="folder" data-col="${escapeAttr(String(id))}">
      <h3>${escapeHtml(c.title || c.name || "未命名合集")}</h3>
      <p>${count} 个内容</p>
    </button>`;
  }).join("")}</div>`;
  contentEl.querySelectorAll("[data-col]").forEach((btn) => {
    btn.addEventListener("click", () => { activeCollectionId = btn.getAttribute("data-col"); currentPage = 1; render(); });
  });
  paginationEl.hidden = true;
}

function renderPlaceholder() {
  contentEl.innerHTML = `<div class="empty">
    <p>此页面在桌面只读版中为界面占位</p>
    <p>实际数据请使用扩展导出后，在「历史记录 / 收藏夹 / 合集 / 我喜欢的音乐」中查看</p>
    <p><button type="button" class="empty-cta" id="empty-open">打开备份</button></p>
  </div>`;
  document.getElementById("empty-open")?.addEventListener("click", () => void openBackup());
  paginationEl.hidden = true;
  pageCount.textContent = "";
}

function renderAbout() {
  pageCount.textContent = "";
  paginationEl.hidden = true;
  const hist = pack?.history?.length || 0;
  const visits = pack?.historyEvents?.length || 0;
  const favs = pack?.favFolders?.length || 0;
  const music = pack?.likedMusic?.length || 0;
  contentEl.innerHTML = `
  <div class="panel-stack">
    <div class="panel-card">
      <div class="panel-head"><h3>关于 · 无限历史记录（桌面）</h3><span class="chip ok">只读</span></div>
      <p class="panel-desc">界面按浏览器扩展主布局对齐。数据<strong>仅来自</strong>扩展导出的备份 JSON，不登录、不同步、不写回。</p>
      <ul class="bullet-list">
        <li>兼容 formatVersion: 2 完整备份包</li>
        <li>兼容旧版顶层 HistoryItem[]</li>
        <li>点击视频 / UP 主链接用系统浏览器打开</li>
      </ul>
      <div class="kv"><span>当前文件</span><span>${escapeHtml(sourceName || "未加载")}</span></div>
      <div class="kv"><span>导出时间</span><span>${escapeHtml(pack?.exportedAt || "—")}</span></div>
      <div class="kv"><span>数据概览</span><span>历史 ${hist} · 观看 ${visits} · 收藏夹 ${favs} · 音乐 ${music}</span></div>
      <div class="panel-actions">
        <button type="button" class="btn primary" id="about-open">打开备份</button>
        <a class="btn" href="https://github.com/lucienlmy/bilibili-history-wxt" target="_blank" rel="noopener">项目主页</a>
      </div>
    </div>
  </div>`;
  document.getElementById("about-open")?.addEventListener("click", () => void openBackup());
}

function renderEmpty() {
  pageCount.textContent = "0";
  paginationEl.hidden = true;
  contentEl.innerHTML = `<div class="empty">
    <p>请打开扩展导出的备份 JSON</p>
    <p>支持 bilibili-history-*.json</p>
    <p><button type="button" class="empty-cta" id="empty-open">打开备份</button></p>
  </div>`;
  document.getElementById("empty-open")?.addEventListener("click", () => void openBackup());
}

const SECONDARY_PAGES = new Set([
  "settings", "cloud", "video-backup", "ai", "feedback", "reward",
  "backup-local", "backup-webdav", "backup-json", "music-search",
]);

function render() {
  const meta = PAGE_META[page] || PAGE_META.history;
  pageTitle.textContent = meta[0];
  pageDesc.textContent = meta[1];
  buildNav();
  // 二级页面（设置/云同步等）无备份也可展示界面壳
  if (!pack && !SECONDARY_PAGES.has(page) && page !== "about") {
    renderEmpty();
    updateClearBtn();
    return;
  }
  if (page === "history") renderHistory();
  else if (page === "favorites") renderFavorites();
  else if (page === "music") renderMusic();
  else if (page === "collections") renderCollections();
  else if (page === "about") renderAbout();
  else {
    const R = globalThis.__BILI_PAGE_RENDERERS || {};
    if (typeof R[page] === "function") R[page]();
    else renderPlaceholder();
  }
  updateClearBtn();
}

async function openBackup() {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const selected = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!selected) return;
    contentEl.innerHTML = skeletonHtml();
    paginationEl.hidden = true;
    const path = typeof selected === "string" ? selected : selected.path || selected;
    pack = normalizeBackup(JSON.parse(await readTextFile(path)));
    sourceName = String(path).split(/[/\\]/).pop() || String(path);
    activeFolderId = null; activeCollectionId = null; currentPage = 1;
    fileMeta.textContent = sourceName + "\n历史 " + pack.history.length + " · 收藏 " + pack.favFolders.length + " · 音乐 " + pack.likedMusic.length;
    render();
  } catch (err) {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        contentEl.innerHTML = skeletonHtml();
        paginationEl.hidden = true;
        pack = normalizeBackup(JSON.parse(await file.text()));
        sourceName = file.name;
        activeFolderId = null; activeCollectionId = null; currentPage = 1;
        fileMeta.textContent = sourceName + "\n历史 " + pack.history.length + " · 收藏 " + pack.favFolders.length + " · 音乐 " + pack.likedMusic.length;
        render();
      } catch (e) {
        fileMeta.textContent = "加载失败：" + (e?.message || String(e));
      }
    };
    input.click();
  }
}

function resetAndRender() {
  currentPage = 1;
  render();
}

// events
document.getElementById("btn-open-2")?.addEventListener("click", () => void openBackup());
document.getElementById("btn-refresh")?.addEventListener("click", () => render());
document.getElementById("btn-collapse")?.addEventListener("click", () => {
  collapsed = !collapsed;
  sidebar.classList.toggle("collapsed", collapsed);
});
document.getElementById("brand-home")?.addEventListener("click", () => {
  if (collapsed) { collapsed = false; sidebar.classList.remove("collapsed"); return; }
  page = "history"; currentPage = 1; render();
});
document.getElementById("btn-toggle-filters")?.addEventListener("click", () => {
  filtersOpen = !filtersOpen;
  filtersEl.classList.toggle("collapsed", !filtersOpen);
});
document.getElementById("btn-theme")?.addEventListener("click", () => {
  document.documentElement.classList.toggle("dark");
});
document.getElementById("btn-clear-filters")?.addEventListener("click", clearFilters);

searchEl?.addEventListener("input", () => { search = searchEl.value; resetAndRender(); });
searchKindEl?.addEventListener("change", () => { searchKind = searchKindEl.value; resetAndRender(); });
sortEl?.addEventListener("change", () => { sort = sortEl.value; resetAndRender(); });
typeEl?.addEventListener("change", () => { typeFilter = typeEl.value; resetAndRender(); });
colsEl?.addEventListener("change", () => { cols = colsEl.value; render(); });
dateStartEl?.addEventListener("change", () => { dateStart = dateStartEl.value; resetAndRender(); });
dateEndEl?.addEventListener("change", () => { dateEnd = dateEndEl.value; resetAndRender(); });

document.getElementById("display-mode")?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-mode]");
  if (!btn) return;
  displayMode = btn.getAttribute("data-mode") || "content";
  document.querySelectorAll("#display-mode [data-mode]").forEach((b) => b.classList.toggle("active", b === btn));
  resetAndRender();
});

navEl?.addEventListener("click", (e) => {
  const toggle = e.target.closest("[data-toggle]");
  if (toggle) {
    const id = toggle.getAttribute("data-toggle");
    if (openGroups.has(id)) openGroups.delete(id); else openGroups.add(id);
    buildNav();
    return;
  }
  const btn = e.target.closest("[data-page]");
  if (!btn) return;
  page = btn.getAttribute("data-page") || "history";
  currentPage = 1;
  activeCollectionId = null;
  render();
});

paginationEl?.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-pg]");
  if (!btn || btn.disabled) return;
  const n = Number(btn.getAttribute("data-pg"));
  if (!Number.isFinite(n) || n < 1) return;
  currentPage = n;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

const vsModal = document.getElementById("view-settings-modal");
document.getElementById("btn-view-settings")?.addEventListener("click", () => {
  const vsCols = document.getElementById("vs-cols");
  const vsPs = document.getElementById("vs-page-size");
  if (vsCols) vsCols.value = cols;
  if (vsPs) vsPs.value = String(PAGE_SIZE);
  if (vsModal) vsModal.hidden = false;
});
document.getElementById("vs-close")?.addEventListener("click", () => { if (vsModal) vsModal.hidden = true; });
document.getElementById("vs-cancel")?.addEventListener("click", () => { if (vsModal) vsModal.hidden = true; });
document.getElementById("vs-save")?.addEventListener("click", () => {
  const vsCols = document.getElementById("vs-cols");
  const vsPs = document.getElementById("vs-page-size");
  if (vsCols) { cols = vsCols.value; if (colsEl) colsEl.value = cols; }
  if (vsPs) PAGE_SIZE = Number(vsPs.value) || 100;
  if (vsModal) vsModal.hidden = true;
  resetAndRender();
});
vsModal?.addEventListener("click", (e) => { if (e.target === vsModal) vsModal.hidden = true; });

window.addEventListener("scroll", () => {
  if (scrollTopBtn) scrollTopBtn.hidden = window.scrollY < 400;
});
scrollTopBtn?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

window.addEventListener("keydown", (e) => {
  if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
    e.preventDefault(); searchEl?.focus();
  }
});

async function openExternal(url) {
  if (!url || url === "#" || url.startsWith("javascript:")) return;
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

contentEl.addEventListener("click", (e) => {
  const a = e.target.closest("a[href]");
  if (!a || e.defaultPrevented) return;
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const href = a.getAttribute("href") || "";
  if (href.startsWith("http://") || href.startsWith("https://")) {
    e.preventDefault();
    void openExternal(href);
  }
});

// 供 secondary.js 注册设置/云同步等二级页 UI
globalThis.__bili = {
  get contentEl() { return contentEl; },
  get pageCount() { return pageCount; },
  get paginationEl() { return paginationEl; },
  get pack() { return pack; },
  get sourceName() { return sourceName; },
  get cols() { return cols; },
  set cols(v) { cols = v; },
  get PAGE_SIZE() { return PAGE_SIZE; },
  set PAGE_SIZE(v) { PAGE_SIZE = v; },
  get colsEl() { return colsEl; },
  escapeHtml,
  openBackup,
  openExternal,
  render,
};

buildNav();
render();
