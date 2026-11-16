/**
 * 桌面版 localBackupHandle：Vite 重定向替代 utils/localBackupHandle。
 *
 * 与扩展版导出相同 API，但 IndexedDB 里只存 { name, path }（可结构化克隆），
 * 读取时再用 createDesktopDirectoryHandle 还原出带方法的句柄对象。
 * 这样 LocalHistoryBackupPanel / localHistoryBackup 的原有逻辑无需改动。
 */
import { createDesktopDirectoryHandle, type DesktopDirectoryHandle } from "./directoryHandle";

const DB_NAME = "bilibiliLocalBackup";
const DB_VERSION = 2;
const STORE = "handles";
const KEY = "historyBackupDirectory";

interface StoredHandle {
  __desktop: true;
  name: string;
  path: string;
}

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("无法打开本地备份配置"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
  });

export const saveLocalBackupDirectoryHandle = async (
  handle: DesktopDirectoryHandle,
): Promise<void> => {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const stored: StoredHandle = {
        __desktop: true,
        name: handle.name,
        path: handle.__desktopPath,
      };
      tx.objectStore(STORE).put(stored, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("保存备份目录失败"));
      tx.onabort = () => reject(tx.error ?? new Error("保存备份目录失败"));
    });
  } finally {
    db.close();
  }
};

export const getLocalBackupDirectoryHandle = async (): Promise<DesktopDirectoryHandle | null> => {
  const db = await openDb();
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("读取备份目录失败"));
    });
    if (!value || typeof value !== "object") return null;
    const stored = value as Partial<StoredHandle>;
    if (stored.__desktop && typeof stored.path === "string") {
      return createDesktopDirectoryHandle(stored.path, stored.name);
    }
    return null;
  } finally {
    db.close();
  }
};

export const clearLocalBackupDirectoryHandle = async (): Promise<void> => {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("清除备份目录失败"));
      tx.onabort = () => reject(tx.error ?? new Error("清除备份目录失败"));
    });
  } finally {
    db.close();
  }
};
