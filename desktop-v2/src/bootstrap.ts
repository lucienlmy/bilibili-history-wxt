/**
 * 启动时把桌面端本地数据灌进 IndexedDB。
 *
 * 扩展的数据层 utils/db.ts 完全基于浏览器原生 IndexedDB（库名 bilibiliHistory，v8），
 * Tauri 的 WebView 同样提供 IndexedDB，因此这里只需把「本地 pack」的各数组写入对应的
 * store，其余查询/分页/搜索逻辑全部原样复用扩展实现，无需重写任何 db 函数。
 *
 * 数据源优先级：
 *   1. 通过 openBackup() 手动选择的 JSON 备份文件
 *   2. Tauri 本地缓存 history_cache.json（load_local_pack）
 *   3. 空数据（全新安装）
 */
import { openDB } from "../../utils/db";
import { invoke, loadLocalPack, type LocalPack } from "./tauri";

const STORE_KEYS: Record<string, keyof LocalPack> = {
  history: "history",
  historyEvents: "historyEvents",
  historyTombstones: "historyTombstones",
  likedMusic: "likedMusic",
  favFolders: "favFolders",
  favResources: "favResources",
  subscribedCollections: "subscribedCollections",
  subscribedCollectionResources: "subscribedCollectionResources",
};

const emptyPack = (): LocalPack => ({
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
});

/** 兼容旧版顶层 HistoryItem[] 备份。 */
const normalizePack = (raw: unknown): LocalPack => {
  const base = emptyPack();
  if (Array.isArray(raw)) {
    return { ...base, history: raw, historyEvents: [] };
  }
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  const pack: LocalPack = { ...base, ...obj, formatVersion: Number(obj.formatVersion) || 2 };
  for (const key of Object.values(STORE_KEYS)) {
    if (!Array.isArray(pack[key])) (pack as any)[key] = [];
  }
  return pack;
};

/** 用 pack 覆盖 IndexedDB（单一事务，避免分页查询读到半写入状态）。 */
const seedIndexedDb = async (pack: LocalPack): Promise<void> => {
  const db = await openDB();
  const storeNames = Object.keys(STORE_KEYS).filter((name) =>
    db.objectStoreNames.contains(name),
  );
  if (storeNames.length === 0) return;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeNames, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    for (const storeName of storeNames) {
      const store = tx.objectStore(storeName);
      store.clear();
      const rows = (pack[STORE_KEYS[storeName]] as unknown[]) ?? [];
      for (const row of rows) store.put(row);
    }
  });
};

const SEEDED_FLAG = "bh:storage:DESKTOP_DB_SEEDED";

/** 从本地缓存或空数据启动（应用入口调用）。
 *  只在首次启动（IndexedDB 未灌入过）时覆盖写入，之后直接沿用 IndexedDB，
 *  避免同步产生的新数据被旧的本地缓存再次覆盖。 */
export const bootstrapLocalData = async (): Promise<LocalPack> => {
  let pack: LocalPack = emptyPack();
  const alreadySeeded = localStorage.getItem(SEEDED_FLAG) === "1";
  if (alreadySeeded) return pack;

  try {
    const cached = await loadLocalPack();
    if (cached) pack = normalizePack(cached);
  } catch (error) {
    console.warn("[bootstrap] 读取本地缓存失败，使用空数据", error);
  }
  await seedIndexedDb(pack);
  localStorage.setItem(SEEDED_FLAG, "1");
  return pack;
};

/** 通过 Tauri 对话框选择并导入一个 JSON 备份文件。 */
export const openBackup = async (): Promise<LocalPack | null> => {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      filters: [{ name: "JSON 备份", extensions: ["json"] }],
      multiple: false,
    });
    if (typeof selected !== "string") return null;
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const text = await readTextFile(selected);
    const pack = normalizePack(JSON.parse(text));
    await seedIndexedDb(pack);
    await invoke("save_local_pack", { pack });
    localStorage.setItem(SEEDED_FLAG, "1");
    return pack;
  } catch (error) {
    console.error("[bootstrap] 导入备份失败", error);
    throw error;
  }
};
