/** Align history cards & empty state with extension (local delete + CTAs) */

function waitBili() {
  return new Promise((resolve) => {
    const tick = () => {
      if (globalThis.__bili?.render) resolve(globalThis.__bili);
      else setTimeout(tick, 40);
    };
    tick();
  });
}

function itemKey(item) {
  return String(item?.bvid || item?.id || "") + "|" + String(item?.view_at || "");
}

async function deleteLocal(key) {
  const b = globalThis.__bili;
  if (!b?.pack || !key) return;
  const before = b.pack.history?.length || 0;
  b.pack.history = (b.pack.history || []).filter((it) => itemKey(it) !== key);
  if (Array.isArray(b.pack.historyEvents)) {
    b.pack.historyEvents = b.pack.historyEvents.filter((it) => itemKey(it) !== key);
  }
  if ((b.pack.history?.length || 0) === before) return;
  if (typeof b.persistPack === "function") {
    try {
      await b.persistPack();
    } catch (e) {
      console.warn("[align-cards] persist", e);
    }
  }
  b.render();
}

function enhanceHistoryCards() {
  document.querySelectorAll("article.history-card").forEach((card) => {
    const action = card.querySelector(".card-action");
    if (!action || action.dataset.aligned === "1") return;
    action.dataset.aligned = "1";

    // Resolve key from title link / cover
    const href =
      card.querySelector(".card-title a")?.getAttribute("href") ||
      card.querySelector("a.cover-wrap")?.getAttribute("href") ||
      "";
    const bvid = (href.match(/\/video\/(BV[\w]+)/i) || [])[1] || "";
    const timeText = card.querySelector("time")?.textContent?.trim() || "";

    // Prefer matching against pack by title+time
    const title = card.querySelector(".card-title")?.textContent?.trim() || "";
    const b = globalThis.__bili;
    let key = "";
    if (b?.pack?.history) {
      const hit = b.pack.history.find((it) => {
        const t = String(it.title || "").trim() === title;
        const bv = bvid && String(it.bvid || "") === bvid;
        return bv || t;
      });
      if (hit) key = itemKey(hit);
    }

    const btn =
      action.tagName === "BUTTON"
        ? action
        : (() => {
            const el = document.createElement("button");
            el.type = "button";
            el.className = "card-action";
            el.innerHTML = action.innerHTML;
            action.replaceWith(el);
            return el;
          })();

    btn.title = "从本地列表删除";
    btn.setAttribute("aria-label", "删除历史记录");
    btn.style.cursor = "pointer";
    btn.style.opacity = "0.55";
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!key) {
        // fallback: remove card DOM only if no pack match
        if (!confirm("从本地列表删除这条历史记录？")) return;
        card.remove();
        return;
      }
      if (!confirm("从本地列表删除这条历史记录？")) return;
      void deleteLocal(key);
    };

    // fav badge class
    card.querySelectorAll(".badge").forEach((badge) => {
      if (badge.textContent?.includes("已收藏")) {
        badge.classList.add("top-right");
        badge.style.right = "0.5rem";
        badge.style.top = "0.5rem";
      }
    });
  });
}

function enhanceEmpty() {
  const empty = document.querySelector("#content .empty");
  if (!empty || empty.dataset.aligned === "1") return;
  const text = empty.textContent || "";
  if (!text.includes("备份") && !text.includes("没有")) return;
  empty.dataset.aligned = "1";
  if (text.includes("同步 B 站") || text.includes("同步历史")) return;
  empty.innerHTML = `
    <p>还没有历史记录</p>
    <p>同步 B 站历史后，你的观看记录会显示在这里。</p>
    <p style="display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap;margin-top:.75rem">
      <button type="button" class="empty-cta" id="empty-sync-align">同步历史记录</button>
      <button type="button" class="btn" id="empty-open-align">打开备份</button>
    </p>`;
  document.getElementById("empty-sync-align")?.addEventListener("click", () => {
    document.getElementById("btn-sync-history")?.click();
  });
  document.getElementById("empty-open-align")?.addEventListener("click", () => {
    document.getElementById("btn-open-2")?.click();
  });
}

function afterRender() {
  enhanceHistoryCards();
  enhanceEmpty();
}

(async () => {
  const b = await waitBili();
  const orig = b.render.bind(b);
  b.render = function patchedRender() {
    orig();
    afterRender();
  };
  // initial
  afterRender();
})();
