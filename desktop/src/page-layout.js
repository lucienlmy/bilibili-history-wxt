
/**
 * Page Layout Controller
 *
 * 统一管理桌面版各页面的全局工具栏。
 * 避免收藏夹、合集、AI、设置等页面继承历史记录的筛选器和操作按钮。
 *
 * 不接管各页面 renderer，不修改页面内部的搜索和分页逻辑。
 */

(() => {
  "use strict";

  const pageEl = document.getElementById("page");
  const toolbar = document.getElementById("toolbar");
  const filters = document.getElementById("filters");
  const pagination = document.getElementById("pagination");
  const pageCount = document.getElementById("page-count");

  if (!pageEl || !toolbar || !filters) return;

  const PAGE_RULES = {
    history: {
      search: true,
      historyFilters: true,
      historyActions: true,
      pagination: true,
    },

    favorites: {
      search: true,
      historyFilters: false,
      historyActions: false,
      pagination: true,
    },

    collections: {
      search: true,
      historyFilters: false,
      historyActions: false,
      pagination: true,
    },

    music: {
      search: true,
      historyFilters: false,
      historyActions: false,
      pagination: true,
    },

    "music-search": {
      search: false,
      historyFilters: false,
      historyActions: false,
      pagination: false,
    },

    ai: {
      search: false,
      historyFilters: false,
      historyActions: false,
      pagination: false,
    },
  };

  const DEFAULT_RULE = {
    search: false,
    historyFilters: false,
    historyActions: false,
    pagination: false,
  };

  const elements = {
    search: document.getElementById("search"),
    searchKind: document.getElementById("search-kind"),
    type: document.getElementById("type-filter"),
    sort: document.getElementById("sort"),
    cols: document.getElementById("cols"),
    dateStart: document.getElementById("date-start"),
    dateEnd: document.getElementById("date-end"),

    login: document.getElementById("btn-login"),
    syncHistory: document.getElementById("btn-sync-history"),
    openBackup: document.getElementById("btn-open-backup"),
    filtersToggle: document.getElementById("btn-filters"),
  };

  function setHidden(element, hidden) {
    if (!element) return;

    element.hidden = Boolean(hidden);
    element.setAttribute("aria-hidden", hidden ? "true" : "false");
  }

  function setControlHidden(element, hidden) {
    if (!element) return;

    // 控件位于 filters-row 中，隐藏控件本身即可，
    // 不影响同一行其他页面仍然需要的搜索框。
    setHidden(element, hidden);
  }

  function getActivePage() {
    const active = document.querySelector(
      "#nav [data-page].active"
    );

    if (active) {
      return active.getAttribute("data-page") || "history";
    }

    // 兼容导航按钮重新构建时的短暂状态。
    const title = document.getElementById("page-title")?.textContent || "";

    const titleMap = {
      "历史记录": "history",
      "收藏夹": "favorites",
      "合集": "collections",
      "AI探索": "ai",
      "搜索音乐": "music-search",
      "我喜欢的音乐": "music",
      "云同步": "cloud",
      "视频备份": "video-backup",
      "设置": "settings",
      "关于": "about",
      "反馈": "feedback",
      "赞赏": "reward",
      "本地目录": "backup-local",
      "WebDAV": "backup-webdav",
      "JSON 文件": "backup-json",
    };

    return titleMap[title] || "history";
  }

  function applyPageLayout() {
    const currentPage = getActivePage();
    const rule = PAGE_RULES[currentPage] || DEFAULT_RULE;

    pageEl.dataset.currentPage = currentPage;

    // 搜索输入框：历史、收藏夹、合集、音乐列表使用。
    setControlHidden(elements.search, !rule.search);

    // 搜索字段选择只在历史记录中使用。
    setControlHidden(
      elements.searchKind,
      !rule.historyFilters
    );

    // 历史记录专属筛选项。
    setControlHidden(elements.type, !rule.historyFilters);
    setControlHidden(elements.sort, !rule.historyFilters);
    setControlHidden(elements.cols, !rule.historyFilters);
    setControlHidden(elements.dateStart, !rule.historyFilters);
    setControlHidden(elements.dateEnd, !rule.historyFilters);

    // 历史记录专属操作按钮。
    setHidden(elements.login, !rule.historyActions);
    setHidden(elements.syncHistory, !rule.historyActions);

    // 打开备份入口保留在历史记录页，其他页面通过 JSON 页操作。
    setHidden(elements.openBackup, currentPage !== "history");

    // 筛选按钮只在历史记录页显示。
    setHidden(elements.filtersToggle, !rule.historyFilters);

    // 非历史页面不保留历史页的筛选容器。
    // 收藏夹、合集、音乐仍可以使用自己的搜索输入框。
    const hasSearch = rule.search;
    setHidden(filters, !hasSearch);

    // 非列表页面不允许继承全局历史分页。
    // 列表页是否显示分页，最终由各 renderer 的 pagination.hidden 决定。
    if (pagination && !rule.pagination) {
      pagination.hidden = true;
      pagination.setAttribute("aria-hidden", "true");
      pagination.innerHTML = "";
    }

    // 空计数不占据标题空间。
    if (pageCount) {
      const hasCount = Boolean(pageCount.textContent.trim());
      pageCount.hidden = !hasCount;
    }

    // 记录当前页面，方便 CSS 按页面控制布局。
    document.documentElement.dataset.currentPage = currentPage;
  }

  // 初始执行。
  applyPageLayout();

  // 监听导航 active 状态、标题和分页变化。
  const observer = new MutationObserver(() => {
    applyPageLayout();
  });

  observer.observe(document.getElementById("nav") || document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "data-page"],
  });

  const title = document.getElementById("page-title");

  if (title) {
    observer.observe(title, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  if (pageCount) {
    observer.observe(pageCount, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  if (pagination) {
    observer.observe(pagination, {
      attributes: true,
      attributeFilter: ["hidden"],
    });
  }

  // 向其他模块提供统一刷新入口。
  globalThis.__BILI_APPLY_PAGE_LAYOUT = applyPageLayout;

  // 处理 renderer 更新内容后的状态。
  document.addEventListener("click", (event) => {
    if (event.target.closest("#nav [data-page]")) {
      requestAnimationFrame(applyPageLayout);
    }
  });

  window.addEventListener("pageshow", applyPageLayout);
})();
