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
  playToken: 0,
};

function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ":" + String(s).padStart(2, "0");
}

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
    <div class="mp-progress-wrap">
      <span class="mp-time" id="mp-cur">0:00</span>
      <input type="range" class="mp-progress" id="mp-progress" min="0" max="1000" value="0" />
      <span class="mp-time" id="mp-dur">0:00</span>
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

  const progress = document.getElementById("mp-progress");
  progress?.addEventListener("input", () => {
    if (!state.audio || !Number.isFinite(state.audio.duration)) return;
    const ratio = Number(progress.value) / 1000;
    state.audio.currentTime = ratio * state.audio.duration;
  });

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
  if (sub) sub.textContent = track?.author || track?.bvid || "—";
  const btn = document.getElementById("mp-toggle");
  if (btn) btn.textContent = state.audio && !state.audio.paused ? "⏸" : "▶";
}

function updateProgress() {
  const audio = state.audio;
  const progress = document.getElementById("mp-progress");
  const cur = document.getElementById("mp-cur");
  const dur = document.getElementById("mp-dur");
  if (!audio || !progress) return;
  const d = audio.duration;
  const t = audio.currentTime;
  if (Number.isFinite(d) && d > 0) {
    progress.value = String(Math.round((t / d) * 1000));
    if (dur) dur.textContent = fmtTime(d);
  }
  if (cur) cur.textContent = fmtTime(t);
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
  state.playlist = Array.isArray(playlist) && playlist.length ? playlist : [track];
  state.index = index >= 0 ? index : 0;
  state.loading = true;
  state.error = "";
  const token = ++state.playToken;
  setStatus("加载中…");
  updateMeta(track);

  document.querySelectorAll("article.music-row.playing").forEach((el) => el.classList.remove("playing"));
  try {
    const row = document.querySelector('article.music-row[data-bvid="' + CSS.escape(track.bvid) + '"]');
    if (row) row.classList.add("playing");
  } catch {}

  try {
    const url = await invoke("fetch_audio_url", { bvid: track.bvid });
    if (token !== state.playToken) return;

    if (state.audio) {
      try {
        state.audio.pause();
        state.audio.src = "";
      } catch {}
      state.audio = null;
    }

    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    state.audio = audio;

    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("loadedmetadata", updateProgress);
    audio.addEventListener("ended", () => {
      void playRelative(1);
    });
    audio.addEventListener("error", () => {
      state.loading = false;
      setStatus("播放失败");
      const btn = document.getElementById("mp-toggle");
      if (btn) btn.textContent = "▶";
    });
    audio.addEventListener("play", () => {
      const btn = document.getElementById("mp-toggle");
      if (btn) btn.textContent = "⏸";
      setStatus("");
    });
    audio.addEventListener("pause", () => {
      const btn = document.getElementById("mp-toggle");
      if (btn) btn.textContent = "▶";
    });

    audio.src = url;
    await audio.play();
    state.loading = false;
    setStatus("");
  } catch (err) {
    if (token !== state.playToken) return;
    state.loading = false;
    state.error = String(err?.message || err);
    setStatus("失败: " + state.error.slice(0, 40));
    const btn = document.getElementById("mp-toggle");
    if (btn) btn.textContent = "▶";
    throw err;
  }
}

function togglePlay() {
  if (!state.audio) {
    if (state.playlist.length && state.index >= 0) {
      void playTrack(state.playlist[state.index], state.playlist, state.index);
    }
    return;
  }
  if (state.audio.paused) {
    void state.audio.play().catch(() => {});
  } else {
    state.audio.pause();
  }
}

async function playRelative(delta) {
  if (!state.playlist.length) return;
  let next = state.index + delta;
  if (next < 0) next = state.playlist.length - 1;
  if (next >= state.playlist.length) next = 0;
  const track = state.playlist[next];
  if (!track) return;
  try {
    await playTrack(track, state.playlist, next);
  } catch (err) {
    console.warn("[music] playRelative", err);
  }
}

function enhanceMusicRows() {
  const playlist =
    globalThis.__bili?.musicPlaylist ||
    Array.from(document.querySelectorAll("article.music-row")).map((row) => {
      const bvid = row.getAttribute("data-bvid") || "";
      const title = row.querySelector(".music-title")?.textContent?.trim() || "未命名";
      const author = row.querySelector(".music-sub span")?.textContent?.trim() || "";
      const cover = row.querySelector(".music-cover")?.getAttribute("src") || "";
      return { bvid, title, author, cover };
    });

  document.querySelectorAll("article.music-row").forEach((row) => {
    if (row.dataset.musicBound) return;
    row.dataset.musicBound = "1";

    const bvid = row.getAttribute("data-bvid") || "";
    const idx = Number(row.getAttribute("data-idx") ?? -1);

    const playBtn = row.querySelector(".music-play-btn");
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const i = idx >= 0 ? idx : playlist.findIndex((t) => t.bvid === bvid);
      const track =
        (i >= 0 ? playlist[i] : null) ||
        trackFromItem({ bvid, title: row.querySelector(".music-title")?.textContent });
      void playTrack(track, playlist.length ? playlist : [track], i >= 0 ? i : 0).catch((err) => {
        alert("播放失败：" + (err?.message || err));
      });
    };

    if (playBtn) {
      playBtn.addEventListener("click", handler);
    }
    row.querySelector(".music-cover")?.addEventListener("click", handler);
    row.querySelector(".music-body")?.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      handler(e);
    });
  });
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
  .mp-cover{width:42px;height:42px;border-radius:.45rem;object-fit:cover;background:var(--wash);flex-shrink:0;}
  .mp-meta{min-width:0;flex:0 1 12rem;}
  .mp-title{font-size:.875rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .mp-sub{font-size:.75rem;color:var(--ink-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .mp-progress-wrap{display:flex;align-items:center;gap:.4rem;flex:1;min-width:8rem;max-width:22rem;}
  .mp-progress{flex:1;height:4px;accent-color:var(--brand);cursor:pointer;}
  .mp-time{font-size:.7rem;color:var(--ink-muted);font-variant-numeric:tabular-nums;min-width:2.2rem;}
  .mp-controls{display:flex;align-items:center;gap:.35rem;flex-shrink:0;}
  .mp-btn{width:2rem;height:2rem;border:0;border-radius:999px;background:var(--wash);cursor:pointer;color:var(--ink-soft);font-size:.9rem;line-height:1;}
  .mp-btn.primary{background:var(--brand);color:#fff;}
  .mp-btn:hover{filter:brightness(1.05);}
  .mp-status{font-size:.72rem;color:var(--ink-muted);max-width:9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .music-list-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.75rem;}
  .music-list-head h2{margin:0;font-size:1.1rem;}
  .music-list-count{font-size:.8rem;color:var(--ink-muted);}
  .music-play-btn{
    flex-shrink:0;width:2rem;height:2rem;border:0;border-radius:999px;
    background:var(--brand-soft, #e8f0fe);color:var(--brand-strong, #1a73e8);cursor:pointer;margin-right:.4rem;
    font-size:.75rem;line-height:1;
  }
  .music-play-btn:hover{filter:brightness(0.97);}
  .music-row{display:flex;align-items:center;gap:.35rem;padding:.45rem .35rem;border-radius:.5rem;cursor:default;}
  .music-row:hover{background:var(--wash);}
  .music-row.playing{background:color-mix(in srgb, var(--brand) 12%, transparent);}
  .music-row.playing .music-play-btn{background:var(--brand);color:#fff;}
  .music-cover{width:48px;height:48px;border-radius:.4rem;object-fit:cover;flex-shrink:0;cursor:pointer;}
  .music-body{min-width:0;flex:1;cursor:pointer;}
  .music-title{margin:0;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .music-title a{color:inherit;text-decoration:none;}
  .music-title a:hover{color:var(--brand);}
  .music-sub{display:flex;gap:.75rem;font-size:.75rem;color:var(--ink-muted);margin-top:.15rem;}
  body:has(#music-player-bar:not([hidden])) .content{padding-bottom:4.8rem;}
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
