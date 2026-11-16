/** 桌面端与 Rust 后端通信的统一封装。 */
import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export const invoke = <T>(cmd: string, args?: Record<string, unknown>): Promise<T> =>
  tauriInvoke<T>(cmd, args);

/** 桌面端本地数据缓存包（格式与扩展 localHistoryBackup 一致，formatVersion: 2）。 */
export interface LocalPack {
  formatVersion: number;
  exportedAt: string;
  history?: unknown[];
  historyEvents?: unknown[];
  historyTombstones?: unknown[];
  likedMusic?: unknown[];
  favFolders?: unknown[];
  favResources?: unknown[];
  subscribedCollections?: unknown[];
  subscribedCollectionResources?: unknown[];
  [key: string]: unknown;
}

export const loadLocalPack = () => invoke<LocalPack | null>("load_local_pack");

export const saveLocalPack = (pack: LocalPack) =>
  invoke<string>("save_local_pack", { pack });

export const getLoginStatus = () =>
  invoke<{ logged_in: boolean; uname: string | null; mid: number | null; has_csrf: boolean }>(
    "get_login_status",
  );

export interface SyncMeta {
  watermark_view_at: number;
  last_sync_at: number | null;
}

export const getSyncMeta = () => invoke<SyncMeta>("get_sync_meta");

export const saveSyncMeta = (watermarkViewAt: number | null, lastSyncAt: number | null) =>
  invoke<void>("save_sync_meta", {
    watermark_view_at: watermarkViewAt,
    last_sync_at: lastSyncAt,
  });
