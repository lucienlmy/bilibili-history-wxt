/** Local history cache: load on boot, save after sync/open */
async function invoke(cmd, args) {
  const { invoke: inv } = await import("@tauri-apps/api/core");
  return inv(cmd, args);
}

function emptyPack() {
  return {
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
}

function normalize(raw) {
  const base = emptyPack();
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    history: Array.isArray(raw.history) ? raw.history : [],
    historyEvents: Array.isArray(raw.historyEvents) ? raw.historyEvents : [],
    historyTombstones: Array.isArray(raw.historyTombstones) ? raw.historyTombstones : [],
    likedMusic: Array.isArray(raw.likedMusic) ? raw.likedMusic : [],
    favFolders: Array.isArray(raw.favFolders) ? raw.favFolders : [],
    favResources: Array.isArray(raw.favResources) ? raw.favResources : [],
    subscribedCollections: Array.isArray(raw.subscribedCollections) ? raw.subscribedCollections : [],
    subscribedCollectionResources: Array.isArray(raw.subscribedCollectionResources)
      ? raw.subscribedCollectionResources
      : [],
  };
}

async function persistPack() {
  const b = globalThis.__bili;
  if (!b?.pack) return null;
  try {
    return await invoke("save_local_pack", { pack: b.pack });
  } catch (err) {
    console.warn("[persistPack]", err);
    return null;
  }
}

async function loadLocalCache() {
  const b = globalThis.__bili;
  if (!b) return false;
  try {
    const data = await invoke("load_local_pack");
    if (!data) return false;
    const pack = normalize(data);
    b.pack = pack;
    b.sourceName = "本地缓存 · 同步数据";
    const meta = b.fileMeta;
    if (meta) {
      meta.textContent =
        b.sourceName +
        "\n历史 " +
        pack.history.length +
        " · 收藏 " +
        pack.favFolders.length +
        " · 音乐 " +
        pack.likedMusic.length;
    }
    return true;
  } catch (err) {
    console.warn("[loadLocalCache]", err);
    return false;
  }
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

(async () => {
  const b = await waitBili();
  b.persistPack = persistPack;
  b.loadLocalCache = loadLocalCache;

  const loaded = await loadLocalCache();
  if (loaded) {
    if (typeof b.resetAndRender === "function") b.resetAndRender();
    else b.render();
    console.info("[desktop] loaded local history cache");
  }
})();
