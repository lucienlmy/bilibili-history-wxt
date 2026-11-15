/** In-app music player — mirrors extension liked-music playback */
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

const state = {
  playlist: [],
  index: -1,
  audio: null,
  loading: false,
  error: "",
};

function ensurePlayerUi() {
  let bar = document.getElementById("music-player-bar");
  if (bar) return bar;
  bar = document.createElement("div");
  bar.id = "music-player-bar";
  bar.className = "music-player-bar";
  bar.hidden = true;
  bar.innerHTML = `
    <img class="mp-cover" id="mp-cover" alt="" />
    <div class="mp-meta">
      <div class="mp-title" id="mp-title">未播放</div>
      <div class="mp-sub" id="mp-sub">—</div>
    </div>
    <div class="mp-controls">
      <button type="button" class="mp-btn" id="mp-prev" title="上一首">⏮</button>
      <button type="button" class="mp-btn primary" id="mp-toggle" title="播放/暂停">▶</button>
      <button type="button" class="mp-btn" id="mp-next" title="下一首">⏭</button>
    </div>
    <div class="mp-status" id="mp-status"></div>
  `;
  document.body.appendChild(bar);
  document.getElementById("mp-prev")?.addEventListener("click", () => void playRelative(-1));
  document.getElementById("mp-next")?.addEventListener("click", () => void playRelative(1));
  document.getElementById("mp-toggle")?.addEventListener("click", () => togglePlay());
  return bar;
}

function setStatus(text) {
  const el = document.getElementById("mp-status");
  if (el) el.textContent = text || "";
}

function updateMeta(track) {
  const bar = ensurePlayerUi();
  bar.hidden = false;
  const cover = document.getElementById("mp-cover");
  const title = document.getElementById("mp-title");
  const sub = document.getElementById("mp-sub");
  if (cover) {
    cover.src = track?.cover || "";
    cover.referrerPolicy = "no-referrer";
  }
  if (title) title.textContent = track?.title || "未命名";
  if (sub) sub.textContent = track?.author || track?.upper?.name || track?.bvid || "—";
  const btn = document.getElementById("mp-toggle");
  if (btn) btn.textContent = state.audio && !state.audio.paused ? "⏸" : "▶";
}

function trackFromItem(item) {
  return {
    bvid: item.bvid || item.bv_id || "",
    title: item.title || "未命名",
    cover: item.cover || "",
    author: item.author || item.upper?.name || item.owner?.name || "",
  };
}

async function playTrack(track, playlist, index) {
  if (!track?.bvid) throw new Error("缺少 bvid");
  ensurePlayerUi();
  state.playlist = playlist || [track];
  state.index = index >= 0 ? index : 0;
  state.loading = true;
  state.error = "";
  setStatus("加载中…");
  updateMeta(track);
  try {
    const url = await invoke("fetch_audio_url", { bvid: track.bvid });
    if (state.audio) {
      try {
        state.audio.pause();
      } catch {}
      state.audio.src = "";
      state.audio = null;
    }
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = url;
    audio.addEventListener("ended", () => void playRelative(1));
    audio.addEventListener("error", () => {
      setStatus("播放失败（可能是 CDN 限制）");
    });
    audio.addEventListener("play", () => updateMeta(track));
    audio.addEventListener("pause", () => updateMeta(track));
    state.audio = audio;
    await audio.play();
    setStatus("");
  } catch (e) {
    state.error = e?.message || String(e);
    setStatus("失败：" + state.error);
    throw e;
  } finally {
    state.loading = false;
    updateMeta(track);
  }
}

async function playRelative(delta) {
  if (!state.playlist.length) return;
  let i = state.index + delta;
  if (i < 0) i = state.playlist.length - 1;
  if (i >= state.playlist.length) i = 0;
  await playTrack(state.playlist[i], state.playlist, i);
}

function togglePlay() {
  const a = state.audio;
  if (!a) {
    if (state.playlist[state.index]) {
      void playTrack(state.playlist[state.index], state.playlist, state.index);
    }
    return;
  }
  if (a.paused) void a.play();
  else a.pause();
  updateMeta(state.playlist[state.index]);
}

function enhanceMusicRows() {
  const b = globalThis.__bili;
  if (!b || b.page !== "music") return;
  const items = (b.pack?.likedMusic || []).slice();
  const playlist = items.map(trackFromItem).filter((t) => t.bvid);

  document.querySelectorAll("article.music-row").forEach((row) => {
    if (row.dataset.musicWired === "1") return;
    row.dataset.musicWired = "1";
    const link = row.querySelector(".music-title a");
    const href = link?.getAttribute("href") || "";
    const bvid = (href.match(/\/video\/(BV[\w]+)/i) || [])[1] || "";
    if (!bvid) return;
    const idx = playlist.findIndex((t) => t.bvid === bvid);
    let btn = row.querySelector(".music-play-btn");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "music-play-btn";
      btn.title = "播放";
      btn.textContent = "▶";
      row.insertBefore(btn, row.firstChild);
    }
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const i = idx >= 0 ? idx : 0;
      const track =
        playlist[i] || trackFromItem({ bvid, title: link?.textContent });
      void playTrack(track, playlist.length ? playlist : [track], i).catch((err) => {
        alert("播放失败：" + (err?.message || err));
      });
    };
  });

  const empty = document.querySelector("#content .empty");
  if (empty && (empty.textContent || "").includes("音乐") && !empty.dataset.musicAligned) {
    empty.dataset.musicAligned = "1";
    empty.innerHTML =
      "<p>还没有喜欢的音乐</p><p>可从备份 JSON 导入，或后续支持从 B 站同步。</p>";
  }
}

function injectCss() {
  if (document.getElementById("music-player-css")) return;
  const s = document.createElement("style");
  s.id = "music-player-css";
  s.textContent = `
  .music-player-bar{
    position:fixed;left:0;right:0;bottom:0;z-index:50;
    display:flex;align-items:center;gap:.75rem;
    padding:.55rem .9rem;border-top:1px solid var(--line);
    background:color-mix(in srgb, var(--paper) 92%, transparent);
    backdrop-filter:blur(10px);
    box-shadow:0 -4px 20px rgba(0,0,0,.06);
  }
  .music-player-bar[hidden]{display:none !important;}
  .mp-cover{width:40px;height:40px;border-radius:.4rem;object-fit:cover;background:var(--wash);}
  .mp-meta{min-width:0;flex:1;}
  .mp-title{font-size:.875rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .mp-sub{font-size:.75rem;color:var(--ink-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .mp-controls{display:flex;align-items:center;gap:.35rem;}
  .mp-btn{width:2rem;height:2rem;border:0;border-radius:999px;background:var(--wash);cursor:pointer;color:var(--ink-soft);}
  .mp-btn.primary{background:var(--brand);color:#fff;}
  .mp-btn:hover{filter:brightness(1.05);}
  .mp-status{font-size:.72rem;color:var(--ink-muted);max-width:10rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .music-play-btn{
    flex-shrink:0;width:2rem;height:2rem;border:0;border-radius:999px;
    background:var(--brand-soft);color:var(--brand-strong);cursor:pointer;margin-right:.35rem;
  }
  .music-row{display:flex;align-items:center;}
  body:has(#music-player-bar:not([hidden])) .content{padding-bottom:4.5rem;}
  `;
  document.head.appendChild(s);
}

(async () => {
  injectCss();
  const b = await waitBili();
  const orig = b.render.bind(b);
  b.render = function () {
    orig();
    enhanceMusicRows();
  };
  enhanceMusicRows();
  b.playMusic = (track, list, i) => playTrack(track, list, i);
})();
