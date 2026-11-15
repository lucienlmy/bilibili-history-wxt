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
  about: ["关于", "桌面版"],
  ai: ["AI探索", "桌面版仅展示占位"],
  cloud: ["云同步", "桌面版占位"],
  "video-backup": ["视频备份", "本地备份队列（网盘上传为扩展能力）"],
  "backup-json": ["JSON 文件", "请使用右上角打开备份"],
  feedback: ["反馈", "桌面版占位"],
  reward: ["赞赏", "桌面版占位"],
  settings: ["设置", "设置页"],
  "music-search": ["搜索音乐", "桌面版占位"],
  "backup-local": ["本地目录", "本地备份目录"],
  "backup-webdav": ["WebDAV", "桌面版占位"],
};
