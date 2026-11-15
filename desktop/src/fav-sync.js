/** Favorites sync — list folders + resources, like extension */
async function invoke(cmd, args) {
  const { invoke: inv } = await import("@tauri-apps/api/core");
  return inv(cmd, args);
}

function waitBili() {
  return new Promise((resolve) => {
    const tick = () => {
      if (globalThis.__bili?.render) resolve(globalThis.__bili);
      else setTimeout(tick, 40);
    };
    tick();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
    upper: media.upper || { name: media.author || "" },
    author: media.upper?.name || media.author || "",
    fav_time: media.fav_time || media.mtime || 0,
  };
}

async function syncAllFavorites() {
  const b = globalThis.__bili;
  if (!b) throw new Error("应用未就绪");

  const st = await invoke("get_login_status");
  if (!st?.logged_in) throw new Error("未登录，请先配置 SESSDATA");

  const folders = await invoke("fetch_favorite_folders");
  if (!Array.isArray(folders) || !folders.length) {
    b.pack = b.pack || {};
    b.pack.favFolders = [];
    b.pack.favResources = [];
    if (typeof b.persistPack === "function") await b.persistPack();
    b.render?.();
    return { folders: 0, resources: 0 };
  }

  const allResources = [];
  for (const folder of folders) {
    const folderId = Number(folder.id);
    if (!folderId) continue;
    let page = 1;
    let indexBase = 0;
    while (page <= 200) {
      const res = await invoke("fetch_favorite_folder_page", {
        mediaId: folderId,
        pn: page,
      });
      const medias = res?.medias || [];
      for (let i = 0; i < medias.length; i++) {
        allResources.push(mapMedia(medias[i], folderId, indexBase + i));
      }
      indexBase += medias.length;
      if (!res?.has_more || !medias.length) break;
      page += 1;
      await sleep(800 + Math.floor(Math.random() * 400));
    }
  }

  if (!b.pack) {
    b.pack = {
      formatVersion: 2,
      history: [],
      historyEvents: [],
      likedMusic: [],
      favFolders: [],
      favResources: [],
      subscribedCollections: [],
      subscribedCollectionResources: [],
    };
  }
  b.pack.favFolders = folders.map((f, index) => ({
    ...f,
    id: Number(f.id),
    index,
    title: f.title || f.name || "未命名收藏夹",
    name: f.title || f.name || "未命名收藏夹",
    media_count: Number(f.media_count || 0),
  }));
  b.pack.favResources = allResources;
  b.sourceName = b.sourceName || "B 站同步 · 收藏夹";
  if (b.fileMeta) {
    b.fileMeta.textContent =
      (b.sourceName || "") +
      "\n历史 " +
      (b.pack.history?.length || 0) +
      " · 收藏 " +
      (b.pack.favFolders?.length || 0) +
      " · 音乐 " +
      (b.pack.likedMusic?.length || 0);
  }
  if (typeof b.persistPack === "function") {
    try {
      await b.persistPack();
    } catch (e) {
      console.warn("[fav-sync] persist", e);
    }
  }
  if (typeof b.resetAndRender === "function") b.resetAndRender();
  else b.render?.();
  return { folders: folders.length, resources: allResources.length };
}

function wireFavSyncButton() {
  const btn =
    document.querySelector(".fav-sync-all") ||
    document.getElementById("fav-sync-all");
  if (!btn || btn.dataset.wired === "1") return;
  btn.dataset.wired = "1";
  btn.disabled = false;
  btn.removeAttribute("disabled");
  btn.title = "同步所有收藏夹";
  btn.textContent = "同步所有";
  btn.addEventListener("click", async () => {
    if (btn.dataset.busy === "1") return;
    btn.dataset.busy = "1";
    const old = btn.textContent;
    btn.textContent = "同步中…";
    btn.disabled = true;
    try {
      const r = await syncAllFavorites();
      alert(`收藏夹同步完成：${r.folders} 个收藏夹，${r.resources} 个内容`);
    } catch (e) {
      console.error(e);
      alert("收藏夹同步失败：" + (e?.message || e));
    } finally {
      btn.dataset.busy = "0";
      btn.disabled = false;
      btn.textContent = old || "同步所有";
    }
  });
}

function isFavoritesPage() {
  if (globalThis.__bili?.page === "favorites") return true;
  const title = document.getElementById("page-title")?.textContent || "";
  if (title.includes("收藏")) return true;
  return Boolean(
    document.querySelector('.nav-item.active[data-page="favorites"]') ||
      document.querySelector('.nav-sub.active[data-page="favorites"]') ||
      document.querySelector(".fav-layout")
  );
}

function enhanceFavEmpty() {
  if (!isFavoritesPage()) return;
  const empty = document.querySelector("#content .empty");
  if (!empty || empty.dataset.favAligned === "1") return;
  const t = empty.textContent || "";
  if (!t.includes("收藏") && !t.includes("备份中没有") && !t.includes("此收藏夹")) return;
  empty.dataset.favAligned = "1";
  empty.innerHTML = `
    <p>还没有收藏夹数据</p>
    <p>登录后点击「同步所有」从 B 站拉取收藏夹。</p>
    <p style="margin-top:.75rem">
      <button type="button" class="empty-cta" id="fav-empty-sync">同步所有收藏夹</button>
    </p>`;
  document.getElementById("fav-empty-sync")?.addEventListener("click", async () => {
    const btn = document.getElementById("fav-empty-sync");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "同步中…";
    }
    try {
      const r = await syncAllFavorites();
      alert(`收藏夹同步完成：${r.folders} 个收藏夹，${r.resources} 个内容`);
    } catch (e) {
      alert("收藏夹同步失败：" + (e?.message || e));
      if (btn) {
        btn.disabled = false;
        btn.textContent = "同步所有收藏夹";
      }
    }
  });
}

function injectFavSyncUi() {
  if (!isFavoritesPage()) return;
  const aside = document.querySelector(".fav-aside .fav-folders-head");
  if (aside && !aside.querySelector(".fav-sync-all") && !document.getElementById("fav-sync-all")) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fav-sync-all";
    btn.id = "fav-sync-all";
    btn.textContent = "同步全部";
    aside.appendChild(btn);
  }
  wireFavSyncButton();
  enhanceFavEmpty();
}

(async () => {
  const b = await waitBili();
  const orig = b.render.bind(b);
  b.render = function () {
    orig();
    injectFavSyncUi();
  };
  injectFavSyncUi();
  b.syncAllFavorites = syncAllFavorites;
})();
