/** Subscribed collections sync — mirrors extension subscribedCollections.ts */
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

function mapCollection(item, index) {
  return {
    id: item.id,
    season_id: item.id,
    mid: item.mid,
    title: item.title || "未命名合集",
    name: item.title || "未命名合集",
    cover: item.cover || "",
    intro: item.intro || "",
    ctime: item.ctime || 0,
    mtime: item.mtime || 0,
    media_count: item.media_count || 0,
    upper: item.upper || { mid: item.mid, name: "未知 UP 主", face: "" },
    index,
  };
}

function mapResource(collectionId, media, index) {
  const bvid = media.bvid || media.bv_id || "";
  return {
    id: `${collectionId}-${media.id}`,
    collection_id: collectionId,
    season_id: collectionId,
    aid: media.id,
    bvid,
    bv_id: bvid,
    title: media.title || "未命名视频",
    cover: media.cover || "",
    duration: media.duration || 0,
    author: media.upper?.name || "未知 UP 主",
    author_name: media.upper?.name || "未知 UP 主",
    author_mid: media.upper?.mid || 0,
    upper: media.upper || { name: media.upper?.name || "未知 UP 主" },
    pubdate: media.pubtime || media.ctime || 0,
    index,
  };
}

async function syncCollectedFolders() {
  const collections = [];
  for (let pn = 1; pn <= 40; pn++) {
    const res = await invoke("fetch_collected_folders_page", { pn });
    const list = res?.list || [];
    for (const item of list) {
      collections.push(mapCollection(item, collections.length));
    }
    if (!res?.has_more || list.length === 0) break;
    await sleep(120);
  }
  return collections;
}

async function syncSeasonResources(collectionId) {
  const resources = [];
  for (let pn = 1; pn <= 80; pn++) {
    const res = await invoke("fetch_season_page", { seasonId: collectionId, pn });
    const medias = res?.medias || [];
    for (const m of medias) {
      resources.push(mapResource(collectionId, m, resources.length));
    }
    if (!res?.has_more || medias.length === 0) break;
    await sleep(120);
  }
  return resources;
}

/** 同步全部合集目录 + 每个合集内容 */
async function syncAllCollections() {
  const b = globalThis.__bili;
  if (!b) throw new Error("__bili 未就绪");
  const folders = await syncCollectedFolders();
  const allResources = [];
  for (const c of folders) {
    const id = Number(c.id);
    if (!id) continue;
    try {
      const list = await syncSeasonResources(id);
      allResources.push(...list);
    } catch (e) {
      console.warn("[collection-sync] season", id, e);
    }
  }
  const pack = b.pack || {
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
  };
  pack.subscribedCollections = folders;
  pack.subscribedCollectionResources = allResources;
  b.pack = pack;
  if (typeof b.persistPack === "function") {
    try {
      await b.persistPack();
    } catch (e) {
      console.warn("[collection-sync] persist", e);
    }
  } else if (globalThis.__biliLocalCache?.persist) {
    try {
      await globalThis.__biliLocalCache.persist(pack);
    } catch (e) {
      console.warn("[collection-sync] local-cache", e);
    }
  }
  b.render?.();
  return { collections: folders.length, resources: allResources.length };
}

function wireCollectionSyncButtons() {
  const syncAll =
    document.querySelector(".col-sync-all") || document.getElementById("col-sync-all");
  if (syncAll && syncAll.dataset.wired !== "1") {
    syncAll.dataset.wired = "1";
    syncAll.disabled = false;
    syncAll.removeAttribute("disabled");
    syncAll.addEventListener("click", async () => {
      if (syncAll.dataset.busy === "1") return;
      syncAll.dataset.busy = "1";
      const old = syncAll.textContent;
      syncAll.textContent = "同步中…";
      syncAll.disabled = true;
      try {
        const r = await syncAllCollections();
        alert(`合集同步完成：${r.collections} 个合集，${r.resources} 个内容`);
      } catch (e) {
        console.error(e);
        alert("合集同步失败：" + (e?.message || e));
      } finally {
        syncAll.dataset.busy = "0";
        syncAll.disabled = false;
        syncAll.textContent = old || "同步全部";
      }
    });
  }

  document.querySelectorAll("[data-col-sync]").forEach((btn) => {
    if (btn.dataset.wired === "1") return;
    btn.dataset.wired = "1";
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = Number(btn.getAttribute("data-col-sync"));
      if (!id) return;
      const old = btn.textContent;
      btn.textContent = "…";
      btn.disabled = true;
      try {
        const b = globalThis.__bili;
        const list = await syncSeasonResources(id);
        const pack = b.pack;
        if (pack) {
          const rest = (pack.subscribedCollectionResources || []).filter(
            (x) => String(x.season_id || x.collection_id) !== String(id),
          );
          pack.subscribedCollectionResources = rest.concat(list);
          b.pack = pack;
          if (typeof b.persistPack === "function") await b.persistPack().catch(() => {});
          b.render?.();
        }
        alert(`合集内容同步完成：${list.length} 个`);
      } catch (err) {
        alert("同步失败：" + (err?.message || err));
      } finally {
        btn.disabled = false;
        btn.textContent = old || "同步";
      }
    });
  });
}

function enhanceColEmpty() {
  const empty = document.querySelector("#content .empty");
  if (!empty || empty.dataset.colAligned === "1") return;
  const t = empty.textContent || "";
  if (!t.includes("合集")) return;
  empty.dataset.colAligned = "1";
  empty.innerHTML = `
    <p>还没有订阅合集数据</p>
    <p>登录后点击「同步全部」从 B 站拉取订阅合集。</p>
    <p style="margin-top:.75rem">
      <button type="button" class="empty-cta" id="col-empty-sync">同步全部合集</button>
    </p>`;
  document.getElementById("col-empty-sync")?.addEventListener("click", async () => {
    const btn = document.getElementById("col-empty-sync");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "同步中…";
    }
    try {
      const r = await syncAllCollections();
      alert(`合集同步完成：${r.collections} 个合集，${r.resources} 个内容`);
    } catch (e) {
      alert("合集同步失败：" + (e?.message || e));
      if (btn) {
        btn.disabled = false;
        btn.textContent = "同步全部合集";
      }
    }
  });
}

(async () => {
  const b = await waitBili();
  const orig = b.render.bind(b);
  b.render = function () {
    orig();
    wireCollectionSyncButtons();
    enhanceColEmpty();
  };
  wireCollectionSyncButtons();
  enhanceColEmpty();
  b.syncAllCollections = syncAllCollections;
})();
