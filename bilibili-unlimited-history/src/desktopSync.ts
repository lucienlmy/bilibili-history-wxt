/**
 * 桌面端同步控制器：调用 Rust 的 B 站 API 命令拉取数据，写入扩展的 IndexedDB。
 *
 * 扩展的同步逻辑在 background service worker 里，桌面版没有那套宿主；
 * 这里复刻"拉取 → 映射 → 用 db.ts 写入"的关键路径，让 UI 的同步按钮真正可用。
 * 数据落地后走 db.ts 的 upsert / replace，分页、去重、墓碑语义都复用扩展实现。
 */
import {
  upsertHistorySnapshots,
  replaceFavFolders,
  saveFavResources,
  replaceSubscribedCollections,
  replaceSubscribedCollectionResources,
  type HistoryItem,
  type FavoriteFolder,
  type FavoriteResource,
  type SubscribedCollection,
  type SubscribedCollectionResource,
} from "../../utils/db";
import { invoke, getSyncMeta, saveSyncMeta } from "./tauri";
import { broadcastProgress } from "./browserShim";

const num = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

interface HistoryPageResult {
  items: unknown[];
  cursor_max: number;
  cursor_view_at: number;
  is_end: boolean;
}

/** 历史记录同步（增量或全量），带进度广播。 */
export const syncHistory = async (isFullSync: boolean): Promise<void> => {
  const meta = await getSyncMeta();
  const watermark = isFullSync ? 0 : num(meta.watermark_view_at, 0);
  const startedAt = Date.now();
  let pages = 0;
  let fetched = 0;
  let newest = 0;
  let oldest = 0;
  let max = 0;
  let viewAt = 0;

  const report = (status: "syncing" | "success" | "error") => {
    broadcastProgress({
      action: "historySyncProgress",
      progress: {
        status,
        mode: isFullSync ? "full" : "incremental",
        pages,
        fetchedItems: fetched,
        newItems: fetched,
        newestViewAt: newest,
        oldestViewAt: oldest,
        targetViewAt: watermark,
        startedAt,
        updatedAt: Date.now(),
      },
    });
  };

  report("syncing");
  try {
    // 增量从水位重叠扫描；全量从 0 开始
    for (;;) {
      const page = await invoke<HistoryPageResult>("fetch_history_page", {
        max: max || null,
        view_at: viewAt || watermark || null,
      });
      pages += 1;
      const items = (page.items ?? []) as HistoryItem[];
      if (items.length > 0) {
        await upsertHistorySnapshots(items, "bilibili");
        fetched += items.length;
        const viewAts = items.map((i) => num(i.view_at, 0)).filter(Boolean);
        if (viewAts.length) {
          newest = Math.max(newest, ...viewAts);
          oldest = oldest === 0 ? Math.min(...viewAts) : Math.min(oldest, ...viewAts);
        }
      }
      if (page.is_end || items.length === 0 || pages > 2000) break;
      // 增量：拉到水位之前即停
      if (!isFullSync && page.cursor_view_at > 0 && page.cursor_view_at < watermark) break;
      max = num(page.cursor_max, max);
      viewAt = num(page.cursor_view_at, viewAt);
    }
    await saveSyncMeta(newest || null, Date.now());
    report("success");
  } catch (error) {
    console.error("[desktopSync] 历史同步失败", error);
    report("error");
    throw error;
  }
};

/** 收藏夹 + 资源同步，写入扩展的收藏夹表。 */
export const syncFavorites = async (): Promise<void> => {
  const foldersRaw = await invoke<unknown[]>("fetch_favorite_folders");
  const folders: FavoriteFolder[] = foldersRaw.map((raw, index) => {
    const f = raw as Record<string, unknown>;
    return {
      ...(f as any),
      id: num(f.id ?? f.media_id),
      fid: num(f.fid ?? f.id ?? f.media_id),
      mid: num(f.mid),
      attr: num(f.attr),
      title: String(f.title ?? f.name ?? "未命名收藏夹"),
      fav_state: num(f.fav_state),
      media_count: num(f.media_count),
      index: num(f.index, index),
    } as FavoriteFolder;
  });
  await replaceFavFolders(folders);

  for (const folder of folders) {
    let pn = 1;
    let index = 0;
    for (;;) {
      const page = await invoke<{ medias: unknown[]; has_more: boolean }>(
        "fetch_favorite_folder_page",
        { media_id: folder.id, pn },
      );
      const resources: FavoriteResource[] = (page.medias ?? []).map((raw) => {
        const m = raw as Record<string, unknown>;
        const bvid = String(m.bv_id ?? m.bvid ?? "");
        return {
          ...(m as any),
          id: num(m.id),
          type: num(m.type),
          title: String(m.title ?? ""),
          cover: String(m.cover ?? ""),
          intro: String(m.intro ?? ""),
          duration: num(m.duration),
          upper: (m.upper as FavoriteResource["upper"]) ?? { mid: 0, name: "", face: "" },
          cnt_info: (m.cnt_info as FavoriteResource["cnt_info"]) ?? {
            collect: 0,
            play: 0,
            danmaku: 0,
          },
          link: String(m.link ?? ""),
          ctime: num(m.ctime),
          pubtime: num(m.pubtime ?? m.pubdate),
          fav_time: num(m.fav_time ?? m.mtime),
          bv_id: bvid,
          bvid,
          folder_id: folder.id,
          index: index++,
        } as FavoriteResource;
      });
      if (resources.length) await saveFavResources(resources);
      if (!page.has_more || pn > 200) break;
      pn += 1;
    }
  }
};

/** 订阅合集目录 + 视频同步。 */
export const syncSubscribedCollections = async (): Promise<void> => {
  let pn = 1;
  const collections: SubscribedCollection[] = [];
  for (;;) {
    const page = await invoke<{ list: unknown[]; count: number; has_more: boolean }>(
      "fetch_collected_folders_page",
      { pn },
    );
    for (const raw of page.list ?? []) {
      const c = raw as Record<string, unknown>;
      collections.push({
        ...(c as any),
        id: num(c.id),
        mid: num(c.mid ?? (c.upper as any)?.mid),
        title: String(c.title ?? ""),
        cover: String(c.cover ?? ""),
        intro: String(c.intro ?? ""),
        ctime: num(c.ctime),
        mtime: num(c.mtime),
        media_count: num(c.media_count),
        upper: (c.upper as SubscribedCollection["upper"]) ?? { mid: 0, name: "", face: "" },
        index: collections.length,
      } as SubscribedCollection);
    }
    if (!page.has_more || pn > 100) break;
    pn += 1;
  }
  await replaceSubscribedCollections(collections);

  for (const collection of collections) {
    let seasonPage = 1;
    const resources: SubscribedCollectionResource[] = [];
    for (;;) {
      const page = await invoke<{ medias: unknown[]; has_more: boolean }>("fetch_season_page", {
        season_id: collection.id,
        pn: seasonPage,
      });
      for (const raw of page.medias ?? []) {
        const m = raw as Record<string, unknown>;
        resources.push({
          id: String(m.id ?? `${collection.id}:${m.bvid ?? resources.length}`),
          collection_id: collection.id,
          aid: num(m.aid ?? m.id),
          bvid: String(m.bvid ?? ""),
          title: String(m.title ?? ""),
          cover: String(m.cover ?? ""),
          duration: num(m.duration),
          author_name: String((m.upper as any)?.name ?? m.author_name ?? ""),
          author_mid: num((m.upper as any)?.mid ?? m.author_mid),
          pubdate: num(m.pubdate ?? m.pubtime),
          index: resources.length,
        } as SubscribedCollectionResource);
      }
      if (!page.has_more || seasonPage > 100) break;
      seasonPage += 1;
    }
    if (resources.length) await replaceSubscribedCollectionResources(collection.id, resources);
  }
};
