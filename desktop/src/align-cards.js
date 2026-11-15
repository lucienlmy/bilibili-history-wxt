/** Align history cards & empty state; delete = Bilibili API + local */
function waitBili() {
  return new Promise((resolve) => {
    const tick = () => {
      if (globalThis.__bili?.render) resolve(globalThis.__bili);
      else setTimeout(tick, 40);
    };
    tick();
  });
}

function contentKey(item) {
  return String(item?.business || "archive") + "|" + String(item?.id ?? "");
}

async function deleteRemoteThenLocal(item) {
  const b = globalThis.__bili;
  if (!b?.pack || !item) return;
  const business = String(item.business || "archive");
  const id = Number(item.id);
  if (!Number.isFinite(id)) throw new Error("记录 id 无效");

  const { invoke } = await import("@tauri-apps/api/core");
  // 1) Bilibili server
  await invoke("delete_history_item", { business, id });
  // 2) local pack
  const ck = contentKey(item);
  b.pack.history = (b.pack.history || []).filter((it) => contentKey(it) !== ck);
  if (Array.isArray(b.pack.historyEvents)) {
    b.pack.historyEvents = b.pack.historyEvents.filter((it) => contentKey(it) !== ck);
  }
  if (typeof b.persistPack === "function") {
    try {
      await b.persistPack();
    } catch (e) {
      console.warn("[delete] persist", e);
    }
  }
  b.render();
}

function enhanceHistoryCards() {
  document.querySelectorAll("article.history-card").forEach((card) => {
    const action = card.querySelector(".card-action");
    if (!action || action.dataset.aligned === "1") return;
    action.dataset.aligned = "1";

    const href =
      card.querySelector(".card-title a")?.getAttribute("href") ||
      card.querySelector("a.cover-wrap")?.getAttribute("href") ||
      "";
    const bvid = (href.match(/\/video\/(BV[\w]+)/i) || [])[1] || "";
    const title = card.querySelector(".card-title")?.textContent?.trim() || "";
    const b = globalThis.__bili;
    let item = null;
    if (b?.pack?.history) {
      item =
        b.pack.history.find((it) => bvid && String(it.bvid || "") === bvid) ||
        b.pack.history.find((it) => String(it.title || "").trim() === title) ||
        null;
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

    btn.title = "删除该内容的全部记录（同步删除 B 站）";
    btn.setAttribute("aria-label", "删除历史记录");
    btn.style.cursor = "pointer";
    btn.style.opacity = "0.55";
    btn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!item) {
        alert("无法定位该条记录，请刷新后重试");
        return;
      }
      if (!confirm("将从 B 站与本地同时删除该内容的历史记录，是否继续？")) return;
      const old = btn.innerHTML;
      btn.disabled = true;
      btn.style.opacity = "0.35";
      try {
        await deleteRemoteThenLocal(item);
      } catch (err) {
        console.error(err);
        alert("删除失败：" + (err?.message || err));
        btn.disabled = false;
        btn.innerHTML = old;
        btn.style.opacity = "0.55";
      }
    };

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
  if (!text.includes("备份") && !text.includes("没有") && !text.includes("历史")) return;
  empty.dataset.aligned = "1";
  if (text.includes("同步 B 站") || text.includes("同步历史")) return;
  empty.innerHTML = `
    <p>还没有历史记录</p>
    <p>同步 B 站历史后，你的观看记录会显示在这里。</p>
    <p style="display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap;margin-top:.75rem">
      <button type="button" class="empty-cta" id="empty-sync-align">同步历史记录</button>
    </p>`;
  document.getElementById("empty-sync-align")?.addEventListener("click", () => {
    document.getElementById("btn-sync-history")?.click();
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
  afterRender();
})();
