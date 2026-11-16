
/**
 * Desktop Favorites Sync
 *
 * 对齐扩展版收藏夹同步规则：
 * - 单个 / 全部收藏夹同步
 * - 增量 / 全量同步
 * - 逐页保存
 * - 断点续传
 * - 风控冷却
 * - 全量同步清理已取消收藏的资源
 *
 * 注意：清空、删除操作仅修改本地备份，不会修改 B 站线上收藏夹。
 */

const PAGE_SIZE = 20;
const MAX_PAGES = 200;

const PAGE_DELAY_MIN = 1500;
const PAGE_DELAY_MAX = 3000;

const FOLDER_DELAY_MIN = 2000;
const FOLDER_DELAY_MAX = 5000;

const RATE_LIMIT_COOLDOWNS = [
  10 * 60 * 1000,
  30 * 60 * 1000,
  60 * 60 * 1000,
];

let running = false;

async function invoke(cmd, args) {
  const { invoke: inv } = await import("@tauri-apps/api/core");
  return inv(cmd, args);
}

function waitBili() {
  return new Promise((resolve) => {
    const tick = () => {
      if (globalThis.__bili?.render) {
        resolve(globalThis.__bili);
      } else {
        setTimeout(tick, 40);
      }
    };

    tick();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function normalizeFolder(folder, index = 0) {
  const id = Number(folder.id ?? folder.media_id);

  return {
    ...folder,
    id,
    index,
    title: folder.title || folder.name || "未命名收藏夹",
    name: folder.title || folder.name || "未命名收藏夹",
    media_count: Number(folder.media_count || 0),
  };
}

function mapMedia(media, folderId, index) {
  const id = Number(media.id);
  const bvid = media.bv_id || media.bvid || "";

  return {
    ...media,
    id,
    folder_id: folderId,
    media_id: folderId,
    index,
    bv_id: bvid,
    bvid,
    title: media.title || "",
    cover: media.cover || "",
    upper: media.upper || {
      name: media.author || "",
    },
    author: media.upper?.name || media.author || "",
    fav_time: Number(media.fav_time || media.mtime || 0),
  };
}

function ensurePack(b) {
  if (!b.pack || typeof b.pack !== "object") {
    b.pack = {
      formatVersion: 2,
      history: [],
      historyEvents: [],
      historyTombstones: [],
      likedMusic: [],
      favFolders: [],
      favResources: [],
      subscribedCollections: [],
      subscribedCollectionResources: [],
    };
  }

  if (!Array.isArray(b.pack.favFolders)) {
    b.pack.favFolders = [];
  }

  if (!Array.isArray(b.pack.favResources)) {
    b.pack.favResources = [];
  }

  return b.pack;
}

/**
 * 进度写入 pack，随本地备份一起持久化。
 *
 * single:
 * {
 *   type: "single",
 *   folderId,
 *   mode,
 *   nextPage,
 *   processedItems,
 *   onlineResourceIds,
 *   ...
 * }
 *
 * all:
 * {
 *   type: "all",
 *   folderIds,
 *   mode,
 *   currentFolderIndex,
 *   nextPage,
 *   ...
 * }
 */
function getProgress(b) {
  const pack = ensurePack(b);

  if (!pack.favSyncProgress || typeof pack.favSyncProgress !== "object") {
    pack.favSyncProgress = {
      single: null,
      all: null,
      rateLimitCount: 0,
    };
  }

  const progress = pack.favSyncProgress;

  if (!("single" in progress)) progress.single = null;
  if (!("all" in progress)) progress.all = null;
  if (!Number.isFinite(progress.rateLimitCount)) {
    progress.rateLimitCount = 0;
  }

  return progress;
}

async function savePack(b) {
  ensurePack(b);

  // 直接调用 Rust 命令，确保保存失败能够被上层捕获。
  await invoke("save_local_pack", {
    pack: b.pack,
  });

  updateFileMeta(b);
}

function updateFileMeta(b) {
  if (!b.fileMeta) return;

  const pack = ensurePack(b);

  b.fileMeta.textContent =
    (b.sourceName || "本地缓存 · 同步数据") +
    "\n历史 " +
    (pack.history?.length || 0) +
    " · 收藏 " +
    (pack.favFolders?.length || 0) +
    " · 音乐 " +
    (pack.likedMusic?.length || 0);
}

function renderAfterChange(b) {
  if (typeof b.resetAndRender === "function") {
    b.resetAndRender();
  } else {
    b.render?.();
  }
}

function getLocalResources(b, folderId) {
  return ensurePack(b).favResources.filter(
    (item) =>
      Number(item.folder_id ?? item.media_id) === Number(folderId),
  );
}

function getLocalFolder(b, folderId) {
  return ensurePack(b).favFolders.find(
    (folder) => Number(folder.id ?? folder.media_id) === Number(folderId),
  );
}

function isRateLimitError(error) {
  const message = String(error?.message || error || "").toLowerCase();

  return (
    message.includes("-412") ||
    message.includes("412") ||
    message.includes("429") ||
    message.includes("风控") ||
    message.includes("访问过于频繁") ||
    message.includes("请求被拦截") ||
    message.includes("risk control")
  );
}

function isRetryableError(error) {
  const message = String(error?.message || error || "").toLowerCase();

  return (
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("连接") ||
    message.includes("超时") ||
    message.includes("http 5") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504")
  );
}

async function fetchPageWithRetry(folderId, page) {
  const delays = [
    2000 + randomBetween(0, 500),
    5000 + randomBetween(0, 500),
  ];

  for (let attempt = 0; ; attempt++) {
    try {
      return await invoke("fetch_favorite_folder_page", {
        mediaId: Number(folderId),
        pn: Number(page),
      });
    } catch (error) {
      if (
        attempt >= delays.length ||
        !isRetryableError(error) ||
        isRateLimitError(error)
      ) {
        throw error;
      }

      console.warn(
        `[fav-sync] 第 ${page} 页请求失败，${delays[attempt]}ms 后重试`,
        error,
      );

      await sleep(delays[attempt]);
    }
  }
}

async function fetchOnlineFolders() {
  const status = await invoke("get_login_status");

  if (!status?.logged_in) {
    throw new Error("未登录，请先配置 SESSDATA");
  }

  const folders = await invoke("fetch_favorite_folders");

  if (!Array.isArray(folders)) {
    throw new Error("B 站返回的收藏夹列表格式异常");
  }

  return folders.map(normalizeFolder);
}

function preserveInvalidMetadata(b, incoming) {
  if (incoming.title !== "已失效视频") {
    return incoming;
  }

  const old = ensurePack(b).favResources.find(
    (item) =>
      Number(item.folder_id ?? item.media_id) === Number(incoming.folder_id) &&
      Number(item.id) === Number(incoming.id),
  );

  if (!old || old.title === "已失效视频") {
    return incoming;
  }

  return {
    ...incoming,
    title: old.title,
    cover: old.cover,
    intro: old.intro,
    upper: old.upper,
    ctime: old.ctime,
  };
}

function upsertResources(b, resources) {
  const pack = ensurePack(b);
  const map = new Map();

  for (const item of pack.favResources) {
    const key =
      Number(item.folder_id ?? item.media_id) +
      ":" +
      Number(item.id);

    map.set(key, item);
  }

  for (const item of resources) {
    const key = Number(item.folder_id) + ":" + Number(item.id);

    map.set(key, preserveInvalidMetadata(b, item));
  }

  pack.favResources = Array.from(map.values());
}

function saveFolder(b, folder) {
  const pack = ensurePack(b);
  const id = Number(folder.id);

  const index = pack.favFolders.findIndex(
    (item) => Number(item.id ?? item.media_id) === id,
  );

  if (index >= 0) {
    pack.favFolders[index] = {
      ...pack.favFolders[index],
      ...folder,
    };
  } else {
    pack.favFolders.push(folder);
  }
}

function removeLocalResourcesNotOnline(b, folderId, onlineIds) {
  const pack = ensurePack(b);

  const before = pack.favResources.length;

  pack.favResources = pack.favResources.filter((item) => {
    const itemFolderId = Number(item.folder_id ?? item.media_id);

    if (itemFolderId !== Number(folderId)) {
      return true;
    }

    return onlineIds.has(Number(item.id));
  });

  return before - pack.favResources.length;
}

function makePageProgress(page, processedItems, totalItems, onlineIds) {
  return {
    currentPage: page,
    nextPage: page + 1,
    processedItems,
    totalItems,
    onlineResourceIds: Array.from(onlineIds),
  };
}

async function saveSingleCheckpoint(b, patch) {
  const progress = getProgress(b);

  progress.single = {
    ...progress.single,
    ...patch,
    updatedAt: Date.now(),
  };

  await savePack(b);
}

async function saveAllCheckpoint(b, patch) {
  const progress = getProgress(b);

  progress.all = {
    ...progress.all,
    ...patch,
    updatedAt: Date.now(),
  };

  await savePack(b);
}

/**
 * 同步单个收藏夹的资源。
 *
 * 增量模式：
 * 当前页首尾资源都已在本地时，保存当前页后停止。
 *
 * 全量模式：
 * 遍历全部分页，完成后清理本地已取消收藏的资源。
 */
async function syncFolderResources(b, folder, options) {
  const {
    isFullSync,
    resumeFrom = null,
    onProgress,
  } = options;

  const folderId = Number(folder.id);

  const localResources = getLocalResources(b, folderId);
  const localIds = new Set(localResources.map((item) => Number(item.id)));

  const onlineIds = new Set(
    (resumeFrom?.onlineResourceIds || []).map(Number),
  );

  let processedItems = Number(resumeFrom?.processedItems || 0);
  let page = Math.max(1, Number(resumeFrom?.nextPage || 1));

  console.info(
    `[fav-sync] 开始同步 ${folder.title}，模式：${isFullSync ? "全量" : "增量"}，页码：${page}`,
  );

  while (page <= MAX_PAGES) {
    const result = await fetchPageWithRetry(folderId, page);

    const medias = result?.medias || [];
    const hasMore = Boolean(result?.has_more ?? result?.hasMore);

    if (!Array.isArray(medias)) {
      throw new Error(`收藏夹「${folder.title}」第 ${page} 页数据格式异常`);
    }

    if (medias.length === 0) {
      if (hasMore) {
        throw new Error(`收藏夹「${folder.title}」分页数据异常`);
      }

      if (onProgress) {
        await onProgress(
          makePageProgress(page, processedItems, folder.media_count, onlineIds),
        );
      }

      break;
    }

    const ids = medias.map((item) => Number(item.id));

    if (
      ids.some(
        (id) => !Number.isSafeInteger(id) || id <= 0,
      )
    ) {
      throw new Error(`收藏夹「${folder.title}」资源 ID 异常`);
    }

    ids.forEach((id) => onlineIds.add(id));

    // 注意：必须在保存本页之前判断增量边界。
    const reachedLocalBoundary =
      !isFullSync &&
      localIds.has(ids[0]) &&
      localIds.has(ids[ids.length - 1]);

    const mapped = medias.map((media, index) =>
      mapMedia(
        media,
        folderId,
        (page - 1) * PAGE_SIZE + index,
      ),
    );

    upsertResources(b, mapped);

    processedItems += mapped.length;

    // 每页完成后先保存资源，再保存断点。
    await savePack(b);

    if (onProgress) {
      await onProgress(
        makePageProgress(page, processedItems, folder.media_count, onlineIds),
      );
    }

    console.info(
      `[fav-sync] ${folder.title}：第 ${page} 页完成，累计 ${processedItems}`,
    );

    if (!hasMore || reachedLocalBoundary) {
      break;
    }

    page += 1;

    await sleep(randomBetween(PAGE_DELAY_MIN, PAGE_DELAY_MAX));
  }

  if (page > MAX_PAGES) {
    throw new Error(
      `收藏夹「${folder.title}」超过 ${MAX_PAGES} 页，已停止以避免异常请求`,
    );
  }

  let removed = 0;

  if (isFullSync) {
    removed = removeLocalResourcesNotOnline(
      b,
      folderId,
      onlineIds,
    );

    await savePack(b);
  }

  return {
    processedItems,
    onlineCount: onlineIds.size,
    removed,
    onlineResourceIds: Array.from(onlineIds),
  };
}

function getRateLimitCooldown(rateLimitCount) {
  const index = Math.min(
    Math.max(0, rateLimitCount - 1),
    RATE_LIMIT_COOLDOWNS.length - 1,
  );

  return RATE_LIMIT_COOLDOWNS[index];
}

function makeFailureState(b, error, base) {
  const progress = getProgress(b);
  const now = Date.now();

  if (isRateLimitError(error)) {
    progress.rateLimitCount += 1;

    const cooldown = getRateLimitCooldown(
      progress.rateLimitCount,
    );

    return {
      ...base,
      status: "paused",
      errorKind: "rate_limited",
      message: "触发 B 站访问风控，同步已暂停",
      retryAfter: now + cooldown,
      rateLimitCount: progress.rateLimitCount,
      updatedAt: now,
    };
  }

  return {
    ...base,
    status: "error",
    errorKind: "request",
    message: String(error?.message || error || "同步失败"),
    updatedAt: now,
  };
}

function checkCooldown(checkpoint) {
  if (
    checkpoint?.status === "paused" &&
    checkpoint.retryAfter &&
    Date.now() < checkpoint.retryAfter
  ) {
    const remaining = Math.ceil(
      (checkpoint.retryAfter - Date.now()) / 1000,
    );

    throw new Error(
      `${checkpoint.message || "同步已暂停"}，请在 ${remaining} 秒后继续`,
    );
  }
}

function canResume(checkpoint, folderId, mode) {
  return Boolean(
    checkpoint &&
    checkpoint.status !== "success" &&
    Number(checkpoint.folderId) === Number(folderId) &&
    checkpoint.mode === mode &&
    Number.isSafeInteger(Number(checkpoint.nextPage)) &&
    Number(checkpoint.nextPage) >= 1,
  );
}

function canResumeAll(checkpoint, folderIds, mode) {
  if (!checkpoint || checkpoint.status === "success") {
    return false;
  }

  if (checkpoint.mode !== mode) return false;

  if (!Array.isArray(checkpoint.folderIds)) return false;

  if (checkpoint.folderIds.length !== folderIds.length) {
    return false;
  }

  return checkpoint.folderIds.every(
    (id, index) => Number(id) === Number(folderIds[index]),
  );
}

/**
 * 同步单个收藏夹。
 */
async function syncSingleFavorite(folderId, isFullSync) {
  const b = globalThis.__bili;
  const pack = ensurePack(b);
  const mode = isFullSync ? "full" : "incremental";

  const folders = await fetchOnlineFolders();
  const folder = folders.find(
    (item) => Number(item.id) === Number(folderId),
  );

  if (!folder) {
    throw new Error("收藏夹不存在或无权访问");
  }

  const progress = getProgress(b);
  const previous = progress.single;

  checkCooldown(
    previous?.folderId === Number(folderId) &&
    previous?.mode === mode
      ? previous
      : null,
  );

  const resume = canResume(previous, folderId, mode)
    ? previous
    : null;

  saveFolder(b, folder);

  const base = {
    type: "single",
    folderId: Number(folderId),
    folderTitle: folder.title,
    mode,
    status: "syncing",
    startedAt: resume?.startedAt || Date.now(),
    currentPage: resume?.currentPage || 0,
    nextPage: resume?.nextPage || 1,
    processedItems: resume?.processedItems || 0,
    totalItems: folder.media_count,
    onlineResourceIds: resume?.onlineResourceIds || [],
  };

  progress.single = {
    ...base,
    updatedAt: Date.now(),
  };

  await savePack(b);

  try {
    const result = await syncFolderResources(b, folder, {
      isFullSync,
      resumeFrom: resume,
      onProgress: async (pageProgress) => {
        await saveSingleCheckpoint(b, {
          ...base,
          ...pageProgress,
          status: "syncing",
        });
      },
    });

    progress.rateLimitCount = 0;

    progress.single = {
      ...progress.single,
      status: "success",
      currentPage: progress.single?.currentPage || 0,
      nextPage: progress.single?.nextPage || 1,
      processedItems: result.processedItems,
      onlineResourceIds: result.onlineResourceIds,
      removed: result.removed,
      message: `「${folder.title}」${isFullSync ? "全量" : "增量"}同步成功`,
      updatedAt: Date.now(),
    };

    await savePack(b);

    return {
      folders: 1,
      resources: result.processedItems,
      removed: result.removed,
    };
  } catch (error) {
    progress.single = makeFailureState(
      b,
      error,
      progress.single || base,
    );

    await savePack(b);

    throw error;
  }
}

/**
 * 依次同步全部收藏夹。
 */
async function syncAllFavorites(isFullSync) {
  const b = globalThis.__bili;
  ensurePack(b);

  const mode = isFullSync ? "full" : "incremental";

  const folders = await fetchOnlineFolders();
  const folderIds = folders.map((folder) => Number(folder.id));

  if (!folders.length) {
    const pack = ensurePack(b);
    pack.favFolders = [];
    pack.favResources = [];

    const progress = getProgress(b);
    progress.all = {
      type: "all",
      status: "success",
      mode,
      folderIds: [],
      currentFolderIndex: 0,
      totalFolders: 0,
      completedCount: 0,
      message: "没有可同步的收藏夹",
      updatedAt: Date.now(),
    };

    await savePack(b);
    renderAfterChange(b);

    return {
      folders: 0,
      resources: 0,
      removed: 0,
    };
  }

  const progress = getProgress(b);
  const previous = progress.all;

  checkCooldown(
    canResumeAll(previous, folderIds, mode)
      ? previous
      : null,
  );

  const resume = canResumeAll(previous, folderIds, mode)
    ? previous
    : null;

  const startIndex = resume
    ? Math.max(
        0,
        Math.min(
          Number(resume.currentFolderIndex || 0),
          folders.length - 1,
        ),
      )
    : 0;

  const totalResourcesBefore = ensurePack(b).favResources.length;
  let removed = 0;

  progress.all = {
    type: "all",
    status: "syncing",
    mode,
    folderIds,
    totalFolders: folders.length,
    currentFolderIndex: startIndex,
    completedCount: startIndex,
    currentFolderId: folders[startIndex].id,
    currentFolderTitle: folders[startIndex].title,
    currentPage: resume?.currentPage || 0,
    nextPage: resume?.nextPage || 1,
    processedItems: resume?.processedItems || 0,
    onlineResourceIds: resume?.onlineResourceIds || [],
    startedAt: resume?.startedAt || Date.now(),
    updatedAt: Date.now(),
  };

  await savePack(b);

  try {
    for (let index = startIndex; index < folders.length; index++) {
      const folder = folders[index];

      saveFolder(b, folder);

      const folderResume =
        index === startIndex && resume
          ? resume
          : null;

      progress.all = {
        ...progress.all,
        status: "syncing",
        currentFolderIndex: index,
        completedCount: index,
        currentFolderId: folder.id,
        currentFolderTitle: folder.title,
        currentPage: folderResume?.currentPage || 0,
        nextPage: folderResume?.nextPage || 1,
        processedItems: folderResume?.processedItems || 0,
        onlineResourceIds: folderResume?.onlineResourceIds || [],
        updatedAt: Date.now(),
      };

      await savePack(b);

      const result = await syncFolderResources(b, folder, {
        isFullSync,
        resumeFrom: folderResume,
        onProgress: async (pageProgress) => {
          await saveAllCheckpoint(b, {
            type: "all",
            status: "syncing",
            mode,
            folderIds,
            totalFolders: folders.length,
            currentFolderIndex: index,
            completedCount: index,
            currentFolderId: folder.id,
            currentFolderTitle: folder.title,
            ...pageProgress,
          });
        },
      });

      removed += result.removed;

      progress.all = {
        ...progress.all,
        status: "syncing",
        currentFolderIndex: index + 1,
        completedCount: index + 1,
        currentFolderId: null,
        currentFolderTitle: "",
        currentPage: 0,
        nextPage: 1,
        processedItems: 0,
        onlineResourceIds: [],
        updatedAt: Date.now(),
      };

      await savePack(b);

      if (index + 1 < folders.length) {
        await sleep(
          randomBetween(FOLDER_DELAY_MIN, FOLDER_DELAY_MAX),
        );
      }
    }

    progress.rateLimitCount = 0;

    progress.all = {
      ...progress.all,
      status: "success",
      currentFolderIndex: folders.length,
      completedCount: folders.length,
      currentFolderId: null,
      currentFolderTitle: "",
      message: `全部 ${folders.length} 个收藏夹${isFullSync ? "全量" : "增量"}同步成功`,
      updatedAt: Date.now(),
    };

    await savePack(b);

    const totalResourcesAfter = ensurePack(b).favResources.length;

    return {
      folders: folders.length,
      resources: Math.max(
        0,
        totalResourcesAfter - totalResourcesBefore,
      ),
      removed,
    };
  } catch (error) {
    progress.all = makeFailureState(
      b,
      error,
      progress.all,
    );

    await savePack(b);

    throw error;
  }
}

/**
 * 本地清空某个收藏夹的资源。
 * 不删除收藏夹目录本身，也不影响线上数据。
 */
async function clearLocalFavoriteFolder(folderId) {
  const b = globalThis.__bili;
  const pack = ensurePack(b);

  const before = pack.favResources.length;

  pack.favResources = pack.favResources.filter(
    (item) =>
      Number(item.folder_id ?? item.media_id) !== Number(folderId),
  );

  const removed = before - pack.favResources.length;

  await savePack(b);
  renderAfterChange(b);

  return removed;
}

/**
 * 本地删除收藏夹及其资源。
 * 不会删除 B 站线上收藏夹。
 */
async function deleteLocalFavoriteFolder(folderId) {
  const b = globalThis.__bili;
  const pack = ensurePack(b);

  pack.favFolders = pack.favFolders.filter(
    (folder) =>
      Number(folder.id ?? folder.media_id) !== Number(folderId),
  );

  pack.favResources = pack.favResources.filter(
    (item) =>
      Number(item.folder_id ?? item.media_id) !== Number(folderId),
  );

  const progress = getProgress(b);

  if (Number(progress.single?.folderId) === Number(folderId)) {
    progress.single = null;
  }

  await savePack(b);
  renderAfterChange(b);
}

/**
 * 根据进度显示同步状态。
 */
function getProgressLabel(progress) {
  if (!progress) return "";

  if (progress.status === "syncing") {
    return `同步中 · 第 ${progress.nextPage || 1} 页`;
  }

  if (progress.status === "paused") {
    return "风控暂停";
  }

  if (progress.status === "error") {
    return "同步失败，可继续";
  }

  if (progress.status === "success") {
    return "已完成";
  }

  return "";
}

function createButton(text, className, handler) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = className || "btn";
  button.textContent = text;

  button.addEventListener("click", handler);

  return button;
}

function setBusy(button, text) {
  if (!button) return;

  button.dataset.oldText = button.textContent;
  button.disabled = true;
  button.textContent = text;
}

function restoreButton(button) {
  if (!button) return;

  button.disabled = false;
  button.textContent = button.dataset.oldText || button.textContent;
  delete button.dataset.oldText;
}

async function runWithBusy(button, label, task) {
  if (running) return;

  running = true;
  setBusy(button, label);

  try {
    const result = await task();

    alert(
      `收藏夹同步完成\n` +
      `收藏夹：${result.folders} 个\n` +
      `处理内容：${result.resources} 个\n` +
      `清理已取消收藏：${result.removed || 0} 个`,
    );
  } catch (error) {
    console.error("[fav-sync]", error);

    alert(
      "收藏夹操作失败：\n" +
      String(error?.message || error),
    );
  } finally {
    running = false;
    restoreButton(button);

    const b = globalThis.__bili;
    if (b) renderAfterChange(b);
  }
}

/**
 * 收藏夹侧栏操作区。
 */
function injectFolderActions(b) {
  const aside = document.querySelector(".fav-aside");

  if (!aside) return;

  let panel = aside.querySelector(".fav-local-actions");

  if (!panel) {
    panel = document.createElement("div");
    panel.className = "fav-local-actions";
    panel.style.cssText =
      "padding:12px;border-top:1px solid var(--border,#eee);display:grid;gap:8px;";

    const foldersEl = aside.querySelector(".fav-folders");

    if (foldersEl) {
      foldersEl.insertAdjacentElement("afterend", panel);
    } else {
      aside.appendChild(panel);
    }
  }

  panel.innerHTML = "";

  const activeButton = aside.querySelector(
    ".fav-folder.active[data-folder]",
  );

  if (!activeButton) {
    const hint = document.createElement("div");
    hint.className = "muted";
    hint.textContent = "选择一个收藏夹以进行单独操作";
    panel.appendChild(hint);
    return;
  }

  const folderId = Number(activeButton.dataset.folder);
  const folder = getLocalFolder(b, folderId);

  if (!folder) return;

  const progress = getProgress(b);
  const singleProgress =
    Number(progress.single?.folderId) === folderId
      ? progress.single
      : null;

  const title = document.createElement("div");
  title.style.cssText = "font-size:12px;color:var(--muted,#888);";
  title.textContent =
    (folder.title || "收藏夹") +
    (getProgressLabel(singleProgress)
      ? " · " + getProgressLabel(singleProgress)
      : "");

  panel.appendChild(title);

  const incrementalButton = createButton(
    "增量同步此收藏夹",
    "btn",
    (event) => {
      const button = event.currentTarget;
      void runWithBusy(button, "同步中…", async () => {
        const result = await syncSingleFavorite(folderId, false);
        renderAfterChange(b);
        return result;
      });
    },
  );

  const fullButton = createButton(
    "全量同步此收藏夹",
    "btn",
    (event) => {
      const button = event.currentTarget;

      if (
        !confirm(
          "全量同步会重新遍历该收藏夹的所有分页，并清理本地已取消收藏的内容。\n\n是否继续？",
        )
      ) {
        return;
      }

      void runWithBusy(button, "全量同步中…", async () => {
        const result = await syncSingleFavorite(folderId, true);
        renderAfterChange(b);
        return result;
      });
    },
  );

  const clearButton = createButton(
    "清空本地内容",
    "btn",
    async () => {
      if (
        !confirm(
          `确定清空「${folder.title}」的本地备份内容吗？\n\n此操作不会影响 B 站线上收藏夹。`,
        )
      ) {
        return;
      }

      try {
        const count = await clearLocalFavoriteFolder(folderId);
        alert(`已清空本地内容，共 ${count} 个项目。`);
      } catch (error) {
        alert("清空失败：" + (error?.message || error));
      }
    },
  );

  const deleteButton = createButton(
    "删除本地收藏夹",
    "btn danger",
    async () => {
      if (
        !confirm(
          `确定从本地备份删除「${folder.title}」及其全部资源吗？\n\n不会删除 B 站线上收藏夹。`,
        )
      ) {
        return;
      }

      try {
        await deleteLocalFavoriteFolder(folderId);
        alert("已删除本地收藏夹。");
      } catch (error) {
        alert("删除失败：" + (error?.message || error));
      }
    },
  );

  panel.append(
    incrementalButton,
    fullButton,
    clearButton,
    deleteButton,
  );
}

/**
 * 全部收藏夹同步按钮。
 */
function wireAllSyncButton() {
  const button =
    document.querySelector(".fav-sync-all") ||
    document.getElementById("fav-sync-all");

  if (!button || button.dataset.wired === "1") return;

  button.dataset.wired = "1";
  button.textContent = "同步全部";
  button.title = "点击选择增量同步或全量同步";

  button.addEventListener("click", () => {
    if (running) return;

    const isFullSync = confirm(
      "选择同步模式：\n\n" +
      "确定：全量同步（重新遍历全部收藏夹）\n" +
      "取消：增量同步（只获取新增内容）",
    );

    void runWithBusy(
      button,
      "同步中…",
      async () => syncAllFavorites(isFullSync),
    );
  });
}

function isFavoritesPage() {
  if (globalThis.__bili?.page === "favorites") return true;

  const title =
    document.getElementById("page-title")?.textContent || "";

  if (title.includes("收藏")) return true;

  return Boolean(
    document.querySelector(
      '.nav-item.active[data-page="favorites"]',
    ) ||
    document.querySelector(
      '.nav-sub.active[data-page="favorites"]',
    ) ||
    document.querySelector(".fav-layout"),
  );
}

function enhanceFavEmpty() {
  if (!isFavoritesPage()) return;

  const empty = document.querySelector("#content .empty");

  if (!empty || empty.dataset.favAligned === "1") return;

  const text = empty.textContent || "";

  if (
    !text.includes("收藏") &&
    !text.includes("备份中没有") &&
    !text.includes("此收藏夹")
  ) {
    return;
  }

  empty.dataset.favAligned = "1";

  empty.innerHTML = `
    <p>还没有收藏夹数据</p>
    <p>登录后点击「同步全部」从 B 站拉取收藏夹。</p>
    <p style="margin-top:.75rem">
      <button type="button" class="empty-cta" id="fav-empty-sync">
        同步所有收藏夹
      </button>
    </p>
  `;

  document
    .getElementById("fav-empty-sync")
    ?.addEventListener("click", (event) => {
      const button = event.currentTarget;

      void runWithBusy(
        button,
        "同步中…",
        async () => syncAllFavorites(false),
      );
    });
}

function injectFavSyncUi(b) {
  if (!isFavoritesPage()) return;

  wireAllSyncButton();
  injectFolderActions(b);
  enhanceFavEmpty();
}

async function initialize() {
  const b = await waitBili();

  const originalRender = b.render.bind(b);

  b.render = function () {
    originalRender();

    // 等待主页面完成 DOM 更新后再注入操作区。
    queueMicrotask(() => injectFavSyncUi(b));
  };

  b.syncAllFavorites = syncAllFavorites;
  b.syncSingleFavorite = syncSingleFavorite;
  b.clearLocalFavoriteFolder = clearLocalFavoriteFolder;
  b.deleteLocalFavoriteFolder = deleteLocalFavoriteFolder;

  injectFavSyncUi(b);
}

void initialize();
