/**
 * WebExtension `browser` API 的桌面端实现。
 *
 * 扩展的页面/组件直接使用全局 `browser`（WXT 注入）。桌面版没有浏览器扩展宿主，
 * 因此这里用 localStorage + 进程内事件总线实现相同的接口，让扩展 UI 原样运行：
 *   - storage.local.*：落到 localStorage（键加前缀），语义与 chrome.storage.local 对齐
 *   - storage.onChanged：set/remove/clear 时在同一进程内广播
 *   - runtime.getURL：返回本地静态资源路径
 *   - runtime.sendMessage：同步/删除等动作路由到 Rust Tauri 命令；进度类消息走 onMessage
 *   - runtime.onMessage：接收后台进度广播（由同步流程主动 push）
 *   - tabs/create：用 opener 打开外部链接
 *   - cookies：从已保存的 SESSDATA/bili_jct 构造，供删除历史等功能读取
 *
 * 该文件必须在 App 加载前执行（在 main.tsx 里最先 import）。
 */
import { invoke, getLoginStatus } from "./tauri";

type Listener = (...args: any[]) => void;

const KEY_PREFIX = "bh:storage:";

const num = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

class EventBus {
  private listeners = new Set<Listener>();

  addListener = (fn: Listener) => {
    this.listeners.add(fn);
  };

  removeListener = (fn: Listener) => {
    this.listeners.delete(fn);
  };

  hasListener = (fn: Listener) => this.listeners.has(fn);

  emit = (...args: any[]): boolean => {
    // 复制一份，避免监听器在回调里增删导致遍历异常
    for (const fn of [...this.listeners]) {
      try {
        fn(...args);
      } catch (error) {
        console.error("[browserShim] listener error", error);
      }
    }
    return this.listeners.size > 0;
  };
}

const storageChanged = new EventBus();
const runtimeOnMessage = new EventBus();

const readRaw = (key: string): unknown => {
  const raw = localStorage.getItem(KEY_PREFIX + key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

const writeRaw = (key: string, value: unknown) => {
  localStorage.setItem(KEY_PREFIX + key, JSON.stringify(value));
};

const emitChanges = (
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
) => {
  storageChanged.emit(changes, "local");
};

const storageLocal = {
  async get(keys?: string | string[] | Record<string, unknown> | null) {
    const result: Record<string, unknown> = {};
    if (keys === null || keys === undefined) {
      // 返回全部（扩展里 get() 无参用的较少，做兼容）
      for (let i = 0; i < localStorage.length; i += 1) {
        const storageKey = localStorage.key(i);
        if (storageKey?.startsWith(KEY_PREFIX)) {
          result[storageKey.slice(KEY_PREFIX.length)] = readRaw(
            storageKey.slice(KEY_PREFIX.length),
          );
        }
      }
      return result;
    }
    if (typeof keys === "string") {
      const value = readRaw(keys);
      if (value !== undefined) result[keys] = value;
      return result;
    }
    if (Array.isArray(keys)) {
      for (const key of keys) {
        const value = readRaw(key);
        if (value !== undefined) result[key] = value;
      }
      return result;
    }
    // 传默认值对象：{ key: defaultValue }
    for (const [key, fallback] of Object.entries(keys)) {
      const value = readRaw(key);
      result[key] = value === undefined ? fallback : value;
    }
    return result;
  },

  async set(items: Record<string, unknown>) {
    const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
    for (const [key, newValue] of Object.entries(items)) {
      const oldValue = readRaw(key);
      writeRaw(key, newValue);
      changes[key] = { oldValue, newValue };
    }
    emitChanges(changes);
  },

  async remove(keys: string | string[]) {
    const list = typeof keys === "string" ? [keys] : keys;
    const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
    for (const key of list) {
      const oldValue = readRaw(key);
      localStorage.removeItem(KEY_PREFIX + key);
      changes[key] = { oldValue };
    }
    emitChanges(changes);
  },

  async clear() {
    const changes: Record<string, { oldValue?: unknown }> = {};
    const keyList: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const storageKey = localStorage.key(i);
      if (storageKey?.startsWith(KEY_PREFIX)) keyList.push(storageKey);
    }
    for (const storageKey of keyList) {
      const key = storageKey.slice(KEY_PREFIX.length);
      changes[key] = { oldValue: readRaw(key) };
      localStorage.removeItem(storageKey);
    }
    emitChanges(changes);
  },

  async getBytesInUse() {
    return 0;
  },
};

/** 同步动作路由：把扩展 background 的消息映射到 Rust 命令或本地处理。 */
const routeMessage = async (message: any): Promise<any> => {
  if (!message || typeof message.action !== "string") return undefined;
  switch (message.action) {
    case "getCookies": {
      const status = await getLoginStatus();
      // SESSDATA 从登录配置里读；bili_jct 若单独保存则一并带上
      const sessdata = readRaw("DESKTOP_SESSDATA") as string | undefined;
      const biliJct = readRaw("DESKTOP_BILI_JCT") as string | undefined;
      const cookies: { name: string; value: string }[] = [];
      if (sessdata) cookies.push({ name: "SESSDATA", value: sessdata });
      if (biliJct) cookies.push({ name: "bili_jct", value: biliJct });
      return { success: status.logged_in, cookies };
    }
    case "deleteHistoryItem": {
      try {
        await invoke("delete_history_item", {
          business: String(message.business),
          id: num(message.id ?? message.itemId),
        });
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }
    case "getFavoriteFolderSyncProgress":
    case "getAllFavoriteFoldersSyncProgress":
      return { progress: null };
    case "syncHistory": {
      // 动态 import 避免 browserShim <-> desktopSync 循环依赖
      const { syncHistory } = await import("./desktopSync");
      await syncHistory(Boolean(message.isFullSync));
      return { success: true, message: "同步完成" };
    }
    case "syncFavoriteFolder":
    case "syncAllFavoriteFolders":
    case "refreshFavoriteFolders": {
      const { syncFavorites } = await import("./desktopSync");
      await syncFavorites();
      return { success: true, message: "收藏夹同步完成" };
    }
    case "syncSubscribedCollections":
    case "syncSubscribedCollectionResources": {
      const { syncSubscribedCollections } = await import("./desktopSync");
      await syncSubscribedCollections();
      return { success: true, message: "订阅合集同步完成" };
    }
    case "runLocalHistoryBackup": {
      // 直接复用扩展的备份逻辑；它依赖的 FileSystemDirectoryHandle 由桌面版
      // localBackupHandle（Vite 重定向）+ showDirectoryPicker polyfill 提供
      const { runLocalHistoryBackup } = await import("../../utils/localHistoryBackup");
      return await runLocalHistoryBackup(Boolean(message.allowEmpty));
    }
    default:
      return undefined;
  }
};

const runtime = {
  lastError: undefined as { message?: string } | undefined,

  getURL(path: string) {
    // 扩展资源在桌面版通过相对路径提供；去掉开头的斜杠以适配 Vite 静态目录
    return `/${String(path).replace(/^\/+/, "")}`;
  },

  sendMessage(message: any, callback?: (response: any) => void) {
    let promise: Promise<any>;
    if (message?.action === "historySyncProgress" || message?.action?.endsWith?.("SyncProgress")) {
      // 进度广播：只投递给 onMessage 监听者，不需要回复
      runtimeOnMessage.emit(message, { id: "desktop" }, () => {});
      promise = Promise.resolve(true);
    } else {
      promise = routeMessage(message);
    }
    if (typeof callback === "function") {
      promise.then(
        (response) => callback(response),
        (error) => {
          runtime.lastError = { message: String(error) };
          callback(undefined);
        },
      );
      return undefined as any;
    }
    return promise;
  },

  onMessage: runtimeOnMessage,
  onInstalled: new EventBus(),
  onConnect: new EventBus(),

  getManifest() {
    return { version: "1.0.0" };
  },

  connect() {
    return { onMessage: new EventBus(), postMessage() {}, disconnect() {} };
  },

  id: "bilibili-unlimited-history-desktop",
};

const tabs = {
  async create(createProperties: { url?: string } = {}) {
    if (createProperties.url) {
      try {
        await invoke("open_external", { url: createProperties.url });
      } catch (error) {
        console.warn("[browserShim] open_external failed", error);
      }
    }
    return { id: 1 };
  },
  async get() {
    return { id: 1, url: location.href };
  },
  async query() {
    return [{ id: 1, url: location.href }];
  },
  onActivated: new EventBus(),
  onUpdated: new EventBus(),
  onRemoved: new EventBus(),
};

const cookies = {
  async get(details: { name?: string; url?: string } = {}) {
    const sessdata = readRaw("DESKTOP_SESSDATA") as string | undefined;
    const biliJct = readRaw("DESKTOP_BILI_JCT") as string | undefined;
    const all = [
      sessdata ? { name: "SESSDATA", value: sessdata } : null,
      biliJct ? { name: "bili_jct", value: biliJct } : null,
    ].filter(Boolean) as { name: string; value: string }[];
    return details?.name ? all.filter((c) => c.name === details.name) : all;
  },
  async getAll() {
    return cookies.get();
  },
};

const permissions = {
  async contains() {
    return true;
  },
  async request() {
    return true;
  },
  onAdded: new EventBus(),
  onRemoved: new EventBus(),
};

const downloads = {
  async download(options: { url?: string; filename?: string } = {}) {
    if (options.url) await invoke("open_external", { url: options.url });
    return 1;
  },
};

// 扩展里既有 browser.storage.onChanged 也有 browser.storage.local.onChanged，
// 两者都指向同一事件总线（Favorites.tsx 用的是 storage.local.onChanged）
Object.assign(storageLocal, { onChanged: storageChanged });

export const desktopBrowser = {
  storage: {
    local: storageLocal,
    sync: storageLocal,
    session: storageLocal,
    onChanged: storageChanged,
  },
  runtime,
  tabs,
  cookies,
  permissions,
  downloads,
  extension: { getURL: runtime.getURL, isAllowedFileSchemeAccess: async () => true },
  action: { onClicked: new EventBus(), setBadgeText: () => {}, setIcon: () => {} },
  alarms: {
    create() {},
    clear() {},
    getAll: async () => [],
    onAlarm: new EventBus(),
  },
  scripting: { executeScript: async () => [] },
  i18n: {
    getMessage: (key: string) => key,
    getUILanguage: () => "zh-CN",
  },
};

/** 桌面端只保留视频备份队列 UI，不运行后台下载/上传执行器。
 *  扩展的 startVideoBackupWorker() 依赖 navigator.locks.request 才启动，
 *  这里将其置空即可让执行器静默跳过，队列数据仍由 UI 正常读写。 */
try {
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: undefined,
  });
} catch {
  // 某些 WebView 不允许覆盖 navigator 属性，忽略即可（最多多一个空转的 worker）
}

/** 供桌面端主动广播进度（同步控制器使用）。 */
export const broadcastProgress = (message: any) => {
  runtimeOnMessage.emit(message, { id: "desktop" }, () => {});
};

/** 拦截 window.open：桌面端用 opener 插件打开系统浏览器，而不是在 WebView 里开新窗口。
 *  这样登录页、文档、定价页、用户主页等外链都能正常打开。 */
try {
  const originalOpen = window.open.bind(window);
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const href = url ? String(url) : "";
    if (href && /^https?:\/\//i.test(href)) {
      invoke("open_external", { url: href }).catch((error) => {
        console.warn("[browserShim] window.open 外链打开失败，回退原行为", error);
        originalOpen(href, target, features);
      });
      return null;
    }
    return originalOpen(href as any, target, features);
  }) as typeof window.open;
} catch {
  // 覆盖失败则保留原行为
}

/** polyfill showDirectoryPicker：让本地目录备份页认为环境支持 File System Access API。 */
try {
  if (!("showDirectoryPicker" in window)) {
    Object.defineProperty(window, "showDirectoryPicker", {
      configurable: true,
      value: async () => {
        const { pickDesktopDirectory } = await import("./desktop/directoryHandle");
        return pickDesktopDirectory();
      },
    });
  }
} catch {
  // 覆盖失败则本地目录备份页会显示不支持提示（降级，不崩）
}

/** 安装全局 browser（在模块副作用阶段执行，import 本文件即可）。 */
const globalScope = globalThis as any;
if (!globalScope.browser) {
  globalScope.browser = desktopBrowser;
}
