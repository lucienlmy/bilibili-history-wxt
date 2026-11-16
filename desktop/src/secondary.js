/** Secondary pages — settings UI closer to extension + other panels */

function bootSecondary() {
  const R = globalThis.__BILI_PAGE_RENDERERS || (globalThis.__BILI_PAGE_RENDERERS = {});

  function g() {
    const b = globalThis.__bili || {};
    return {
      contentEl: b.contentEl,
      pageCount: b.pageCount,
      paginationEl: b.paginationEl,
      pack: b.pack,
      sourceName: b.sourceName,
      fileMeta: b.fileMeta,
      cols: b.cols,
      PAGE_SIZE: b.PAGE_SIZE,
      colsEl: b.colsEl,
      escapeHtml: b.escapeHtml || ((s) => String(s ?? "")),
      openBackup: b.openBackup,
      openExternal: b.openExternal,
      render: b.render,
      setCols(v) { if (b) b.cols = v; },
      setPageSize(v) { if (b) b.PAGE_SIZE = v; },
    };
  }

  function pageShellNote(text) {
    return `<div class="note-banner">${text}</div>`;
  }

  function loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem("bili-desktop-settings") || "{}");
    } catch {
      return {};
    }
  }
  function savePrefs(p) {
    localStorage.setItem("bili-desktop-settings", JSON.stringify(p));
  }

  const VB_QUEUE_KEY = "bili-desktop-video-backup-queue";
  function loadVbQueue() {
    try {
      const arr = JSON.parse(localStorage.getItem(VB_QUEUE_KEY) || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  function saveVbQueue(list) {
    localStorage.setItem(VB_QUEUE_KEY, JSON.stringify(list));
  }

  R.settings = function () {
    const { contentEl, pageCount, paginationEl, cols, PAGE_SIZE, colsEl, openBackup } = g();
    paginationEl.hidden = true;
    pageCount.textContent = "";
    const prefs = loadPrefs();

    contentEl.innerHTML = `
  <div class="settings-grid">
    <div class="settings-col">
      <h3 class="settings-col-title">界面与列表</h3>
      <div class="setting-card">
        <div class="setting-card-text">
          <h3>网格列数</h3>
          <p>历史记录卡片每行列数</p>
        </div>
        <div class="setting-card-ctrl">
          <select id="set-cols">
            <option value="auto">自动</option>
            <option value="3">3 列</option>
            <option value="4">4 列</option>
            <option value="5">5 列</option>
          </select>
        </div>
      </div>
      <div class="setting-card">
        <div class="setting-card-text">
          <h3>每页条数</h3>
          <p>分页时每页显示数量</p>
        </div>
        <div class="setting-card-ctrl">
          <select id="set-page-size">
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
          </select>
        </div>
      </div>
      <div class="setting-card">
        <div class="setting-card-text">
          <h3>数据备份入口</h3>
          <p>导入 / 导出请到「数据备份 → JSON 文件」</p>
        </div>
        <div class="setting-card-ctrl">
          <button type="button" class="btn soft" id="set-json">打开 JSON 页</button>
        </div>
      </div>
    </div>
    <div class="settings-col">
      <h3 class="settings-col-title">同步与账号</h3>
      <div class="setting-card">
        <div class="setting-card-text">
          <h3>B 站登录</h3>
          <p>通过工具栏「登录」配置 SESSDATA</p>
        </div>
        <div class="setting-card-ctrl"><span class="chip ok">可用</span></div>
      </div>
      <div class="setting-card">
        <div class="setting-card-text">
          <h3>历史同步</h3>
          <p>工具栏「同步记录」支持增量 / 全量</p>
        </div>
        <div class="setting-card-ctrl"><span class="chip ok">可用</span></div>
      </div>
      <div class="setting-card is-disabled">
        <div class="setting-card-text">
          <h3>自动同步策略</h3>
          <p>扩展侧定时策略，桌面版后续再对齐</p>
        </div>
        <div class="setting-card-ctrl"><span class="chip">暂不可用</span></div>
      </div>
    </div>
  </div>`;

    const colsSel = document.getElementById("set-cols");
    const pageSel = document.getElementById("set-page-size");
    if (colsSel) colsSel.value = String(cols || prefs.cols || "4");
    if (pageSel) pageSel.value = String(PAGE_SIZE || prefs.pageSize || 100);

    colsSel?.addEventListener("change", () => {
      const b = globalThis.__bili;
      if (!b) return;
      b.cols = colsSel.value;
      if (b.colsEl) b.colsEl.value = colsSel.value;
      const p = loadPrefs();
      p.cols = colsSel.value;
      savePrefs(p);
      b.render?.();
    });
    pageSel?.addEventListener("change", () => {
      const b = globalThis.__bili;
      if (!b) return;
      b.PAGE_SIZE = Number(pageSel.value) || 100;
      const p = loadPrefs();
      p.pageSize = b.PAGE_SIZE;
      savePrefs(p);
      b.render?.();
    });
    document.getElementById("set-json")?.addEventListener("click", () => {
      document.querySelector('[data-page="backup-json"]')?.click();
    });
  };

  R.about = function () {
    const { contentEl, pageCount, paginationEl, pack, sourceName, escapeHtml } = g();
    paginationEl.hidden = true;
    pageCount.textContent = "";
    contentEl.innerHTML = `
  <div class="panel-stack">
    <div class="panel-card">
      <h3>关于无限历史记录 · 桌面版</h3>
      <p class="panel-desc">界面与交互对齐浏览器扩展；数据来自 B 站同步与本地备份。</p>
      <div class="kv"><span>当前数据源</span><span>${escapeHtml(sourceName || "未加载")}</span></div>
      <div class="kv"><span>历史</span><span>${(pack?.history || []).length}</span></div>
      <div class="kv"><span>收藏夹</span><span>${(pack?.favFolders || []).length}</span></div>
      <div class="kv"><span>订阅合集</span><span>${(pack?.subscribedCollections || []).length}</span></div>
      <div class="kv"><span>音乐</span><span>${(pack?.likedMusic || []).length}</span></div>
    </div>
  </div>`;
  };

  R.ai = function () {
    const { contentEl, pageCount, paginationEl } = g();
    paginationEl.hidden = true;
    pageCount.textContent = "";
    contentEl.innerHTML = `
  ${pageShellNote("AI 探索为扩展能力，桌面版仅保留界面占位。")}
  <div class="ai-shell">
    <div class="ai-search">
      <input type="search" placeholder="描述你想找的视频…" disabled />
      <button type="button" class="btn primary" disabled>探索</button>
    </div>
    <div class="panel-card muted"><div class="empty-inline">暂无结果</div></div>
  </div>`;
  };

  R.cloud = function () {
    const { contentEl, pageCount, paginationEl } = g();
    paginationEl.hidden = true;
    pageCount.textContent = "";
    contentEl.innerHTML = `
  ${pageShellNote("云同步为扩展能力。桌面请使用「同步记录」与「本地目录备份」。")}
  <div class="panel-card">
    <h3>云同步</h3>
    <p class="panel-desc">扩展可将数据同步到自建服务。桌面版后续可再对接。</p>
    <div class="panel-actions">
      <button type="button" class="btn primary" disabled>配置云同步</button>
    </div>
  </div>`;
  };

  R["video-backup"] = function () {
    const { contentEl, pageCount, paginationEl, pack, escapeHtml, openExternal } = g();
    paginationEl.hidden = true;
    pageCount.textContent = "";

    const statusLabel = (s) => {
      if (s === "done") return "已打开";
      if (s === "failed") return "失败";
      return "待处理";
    };
    const statusChip = (s) => {
      if (s === "done") return "ok";
      if (s === "failed") return "";
      return "";
    };

    const renderVb = () => {
      const queue = loadVbQueue();
      const hist = pack?.history || [];
      const recent = hist
        .filter((x) => (x.bvid || x.bv_id) && (x.business || "archive") === "archive")
        .slice(0, 30);
      const pending = queue.filter((x) => x.status === "pending").length;
      const done = queue.filter((x) => x.status === "done").length;

      const queueRows = queue.length
        ? queue
            .map((item, idx) => {
              const bvid = item.bvid || "";
              const title = item.title || bvid || "未命名";
              return `<div class="vb-row" data-vb-idx="${idx}">
          <div class="vb-row-main">
            <strong title="${escapeHtml(title)}">${escapeHtml(title)}</strong>
            <span class="vb-bvid">${escapeHtml(bvid)}</span>
          </div>
          <div class="vb-row-actions">
            <span class="chip ${statusChip(item.status)}">${statusLabel(item.status)}</span>
            <button type="button" class="btn soft" data-vb-open="${escapeHtml(bvid)}">打开</button>
            <button type="button" class="btn" data-vb-remove="${idx}">移除</button>
          </div>
        </div>`;
            })
            .join("")
        : `<div class="empty-inline">队列为空。可从下方最近历史加入，或先去历史记录页浏览。</div>`;

      const recentRows = recent.length
        ? recent
            .map((item) => {
              const bvid = item.bvid || item.bv_id || "";
              const title = item.title || bvid;
              const inQ = queue.some((q) => q.bvid === bvid);
              return `<div class="vb-row">
          <div class="vb-row-main">
            <strong title="${escapeHtml(title)}">${escapeHtml(title)}</strong>
            <span class="vb-bvid">${escapeHtml(bvid)}</span>
          </div>
          <div class="vb-row-actions">
            <button type="button" class="btn soft" data-vb-add="${escapeHtml(bvid)}" data-vb-title="${escapeHtml(title)}" ${inQ ? "disabled" : ""}>${inQ ? "已在队列" : "加入队列"}</button>
          </div>
        </div>`;
            })
            .join("")
        : `<div class="empty-inline">暂无历史视频，请先同步历史记录。</div>`;

      contentEl.innerHTML = `
  ${pageShellNote("扩展版可将视频下载后上传百度网盘。桌面版先提供本地任务队列：记录待备份视频，并一键在浏览器打开对应页面。")}
  <div class="panel-card">
    <div class="panel-head"><h3>视频备份</h3><span class="chip ok">本地队列</span></div>
    <div class="kv"><span>当前历史条数</span><span>${hist.length}</span></div>
    <div class="kv"><span>队列</span><span>待处理 ${pending} · 已处理 ${done} · 合计 ${queue.length}</span></div>
    <div class="panel-actions" style="margin-top:1rem">
      <button type="button" class="btn primary" id="vb-open-all" ${pending ? "" : "disabled"}>打开全部待处理</button>
      <button type="button" class="btn" id="vb-clear-done" ${done ? "" : "disabled"}>清除已处理</button>
      <button type="button" class="btn" id="vb-clear-all" ${queue.length ? "" : "disabled"}>清空队列</button>
      <button type="button" class="btn" id="vb-goto-backup-local">本地目录备份</button>
      <button type="button" class="btn" id="vb-goto-history">查看历史记录</button>
    </div>
    <p class="panel-desc" style="margin-top:.75rem">说明：网盘登录与自动下载上传仍为扩展能力；桌面版后续可对接本机下载目录。</p>
  </div>
  <div class="panel-card" style="margin-top:1rem">
    <h3 style="margin:0 0 .75rem;font-size:1rem">备份队列</h3>
    <div class="vb-list">${queueRows}</div>
  </div>
  <div class="panel-card" style="margin-top:1rem">
    <h3 style="margin:0 0 .75rem;font-size:1rem">从最近历史加入</h3>
    <div class="vb-list">${recentRows}</div>
  </div>`;

      const go = (pageId) => {
        const navBtn =
          document.querySelector(`[data-page="${pageId}"]`) ||
          document.querySelector(`.nav-item[data-page="${pageId}"]`);
        if (navBtn) {
          navBtn.click();
          return;
        }
        const b = globalThis.__bili;
        if (b && "page" in b) {
          b.page = pageId;
          b.render?.();
        }
      };
      document.getElementById("vb-goto-backup-local")?.addEventListener("click", () => go("backup-local"));
      document.getElementById("vb-goto-history")?.addEventListener("click", () => go("history"));

      document.getElementById("vb-clear-done")?.addEventListener("click", () => {
        saveVbQueue(loadVbQueue().filter((x) => x.status !== "done"));
        renderVb();
      });
      document.getElementById("vb-clear-all")?.addEventListener("click", () => {
        if (!confirm("确定清空全部备份队列？")) return;
        saveVbQueue([]);
        renderVb();
      });
      document.getElementById("vb-open-all")?.addEventListener("click", async () => {
        const list = loadVbQueue();
        let changed = false;
        for (const item of list) {
          if (item.status !== "pending" || !item.bvid) continue;
          const url = "https://www.bilibili.com/video/" + item.bvid;
          try {
            if (typeof openExternal === "function") await openExternal(url);
            else window.open(url, "_blank");
            item.status = "done";
            changed = true;
          } catch (e) {
            item.status = "failed";
            item.error = String(e?.message || e);
            changed = true;
          }
        }
        if (changed) saveVbQueue(list);
        renderVb();
      });

      contentEl.querySelectorAll("[data-vb-open]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const bvid = btn.getAttribute("data-vb-open");
          if (!bvid) return;
          const url = "https://www.bilibili.com/video/" + bvid;
          try {
            if (typeof openExternal === "function") await openExternal(url);
            else window.open(url, "_blank");
            const list = loadVbQueue();
            const hit = list.find((x) => x.bvid === bvid);
            if (hit) {
              hit.status = "done";
              saveVbQueue(list);
              renderVb();
            }
          } catch (e) {
            alert("打开失败：" + (e?.message || e));
          }
        });
      });
      contentEl.querySelectorAll("[data-vb-remove]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const idx = Number(btn.getAttribute("data-vb-remove"));
          const list = loadVbQueue();
          if (idx >= 0 && idx < list.length) {
            list.splice(idx, 1);
            saveVbQueue(list);
            renderVb();
          }
        });
      });
      contentEl.querySelectorAll("[data-vb-add]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const bvid = btn.getAttribute("data-vb-add");
          const title = btn.getAttribute("data-vb-title") || bvid;
          if (!bvid) return;
          const list = loadVbQueue();
          if (list.some((x) => x.bvid === bvid)) return;
          list.unshift({
            bvid,
            title,
            status: "pending",
            addedAt: Date.now(),
          });
          saveVbQueue(list);
          renderVb();
        });
      });
    };

    renderVb();
  };

  R.feedback = function () {
    const { contentEl, pageCount, paginationEl } = g();
    paginationEl.hidden = true;
    pageCount.textContent = "";
    contentEl.innerHTML = `
  <div class="panel-card">
    <h3>反馈</h3>
    <p class="panel-desc">请到 GitHub 提交 Issue。</p>
    <div class="panel-actions">
      <a class="btn primary" href="https://github.com/lucienlmy/bilibili-history-wxt/issues" target="_blank" rel="noopener">打开 Issues</a>
    </div>
  </div>`;
  };

  R.reward = function () {
    const { contentEl, pageCount, paginationEl } = g();
    paginationEl.hidden = true;
    pageCount.textContent = "";
    contentEl.innerHTML = `
  <div class="panel-card">
    <h3>赞赏支持</h3>
    <p class="panel-desc">感谢支持。桌面版不展示收款码，请在扩展或项目页查看。</p>
    <div class="reward-placeholder">♥</div>
    <div class="panel-actions center">
      <a class="btn primary" href="https://github.com/lucienlmy/bilibili-history-wxt" target="_blank" rel="noopener">前往项目主页</a>
    </div>
  </div>`;
  };

  R["backup-local"] = function () {
    const { contentEl, pageCount, paginationEl, pack } = g();
    paginationEl.hidden = true;
    pageCount.textContent = "";

    const escapeHtmlSafe = (s) =>
      String(s ?? "").replace(/[&<>"']/g, (ch) => {
        if (ch === "&") return "&" + "amp;";
        if (ch === "<") return "&" + "lt;";
        if (ch === ">") return "&" + "gt;";
        if (ch === '"') return "&" + "quot;";
        return "&#39;";
      });

    const renderPanel = async () => {
      let status = { path: null, last_dir_backup_at: null };
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        status = await invoke("get_backup_dir_status");
      } catch (e) {
        console.warn(e);
      }
      const path = status?.path || "";
      const last = status?.last_dir_backup_at
        ? new Date(status.last_dir_backup_at).toLocaleString()
        : "尚未备份";
      contentEl.innerHTML = `
  <div class="panel-card">
    <div class="panel-head"><h3>本地目录备份</h3><span class="chip ok">可用</span></div>
    <p class="panel-desc">选择电脑上的一个目录，把当前历史等数据保存为 JSON 文件，不经过任何第三方。与扩展「本地目录备份」一致。</p>
    <div class="kv"><span>备份目录</span><span>${path ? escapeHtmlSafe(path) : "未选择"}</span></div>
    <div class="kv"><span>上次备份</span><span>${escapeHtmlSafe(last)}</span></div>
    <div class="kv"><span>当前数据</span><span>历史 ${(pack?.history || []).length} · 收藏 ${(pack?.favFolders || []).length} · 音乐 ${(pack?.likedMusic || []).length}</span></div>
    <div class="panel-actions">
      <button type="button" class="btn primary" id="bl-pick">选择目录</button>
      <button type="button" class="btn" id="bl-backup" ${path ? "" : "disabled"}>立即备份</button>
      <button type="button" class="btn" id="bl-clear" ${path ? "" : "disabled"}>移除目录配置</button>
    </div>
    <p class="panel-desc" id="bl-msg" style="margin-top:.75rem"></p>
  </div>`;

      const msg = (t, ok) => {
        const el = document.getElementById("bl-msg");
        if (el) {
          el.textContent = t || "";
          el.style.color = ok === false ? "#b91c1c" : "var(--ink-muted)";
        }
      };

      document.getElementById("bl-pick")?.addEventListener("click", async () => {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const p = await invoke("pick_backup_directory");
          if (p) {
            msg("已选择： " + p, true);
            await renderPanel();
          }
        } catch (e) {
          msg("选择失败：" + (e?.message || e), false);
        }
      });
      document.getElementById("bl-backup")?.addEventListener("click", async () => {
        const b = globalThis.__bili;
        if (!b?.pack) {
          msg("没有可备份的数据，请先同步历史记录", false);
          return;
        }
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const out = await invoke("export_pack_to_backup_dir", { pack: b.pack });
          msg("已写入：" + out, true);
          await renderPanel();
        } catch (e) {
          msg("备份失败：" + (e?.message || e), false);
        }
      });
      document.getElementById("bl-clear")?.addEventListener("click", async () => {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("clear_backup_directory");
          msg("已移除目录配置（已有文件不会删除）", true);
          await renderPanel();
        } catch (e) {
          msg(String(e?.message || e), false);
        }
      });
    };

    void renderPanel();
  };

  R["backup-webdav"] = function () {
    const { contentEl, pageCount, paginationEl } = g();
    paginationEl.hidden = true;
    pageCount.textContent = "";
    contentEl.innerHTML = `
  ${pageShellNote("WebDAV 仅扩展支持。")}
  <div class="panel-card">
    <h3>WebDAV</h3>
    <label class="field-block"><span>服务器地址</span><input type="text" disabled placeholder="https://example.com/dav/" /></label>
    <label class="field-block"><span>用户名</span><input type="text" disabled /></label>
    <label class="field-block"><span>密码</span><input type="password" disabled /></label>
    <div class="panel-actions">
      <button type="button" class="btn primary" disabled>保存并测试</button>
    </div>
  </div>`;
  };

  R["backup-json"] = function () {
    const { contentEl, pageCount, paginationEl, sourceName, pack, escapeHtml, openBackup } = g();
    paginationEl.hidden = true;
    pageCount.textContent = "";
    contentEl.innerHTML = `
  <div class="panel-card">
    <div class="panel-head"><h3>JSON 文件</h3><span class="chip ok">可用</span></div>
    <p class="panel-desc">与扩展相同：可导出当前数据为 JSON，或导入已有备份文件合并到本地。</p>
    <div class="kv"><span>当前数据源</span><span>${escapeHtml(sourceName || "未加载")}</span></div>
    <div class="kv"><span>导出时间</span><span>${escapeHtml(pack?.exportedAt || "—")}</span></div>
    <div class="kv"><span>历史 / 收藏 / 音乐</span><span>${(pack?.history || []).length} / ${(pack?.favFolders || []).length} / ${(pack?.likedMusic || []).length}</span></div>
    <div class="panel-actions">
      <button type="button" class="btn primary" id="bj-export">导出数据</button>
      <button type="button" class="btn" id="bj-import">导入数据</button>
    </div>
    <p class="panel-desc" id="bj-msg" style="margin-top:.75rem"></p>
  </div>`;
    const msg = (t, ok) => {
      const el = document.getElementById("bj-msg");
      if (el) {
        el.textContent = t || "";
        el.style.color = ok === false ? "#b91c1c" : "var(--ink-muted)";
      }
    };
    document.getElementById("bj-export")?.addEventListener("click", async () => {
      const b = globalThis.__bili;
      if (!b?.pack) {
        msg("没有可导出的数据，请先同步或导入", false);
        return;
      }
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const out = await invoke("export_pack_as_file", { pack: b.pack });
        if (out) msg("已导出：" + out, true);
      } catch (e) {
        msg("导出失败：" + (e?.message || e), false);
      }
    });
    document.getElementById("bj-import")?.addEventListener("click", () => {
      void openBackup();
    });
  };

  R["music-search"] = function () {
    const { contentEl, pageCount, paginationEl, escapeHtml } = g();
    paginationEl.hidden = true;
    pageCount.textContent = "";

    let currentKeyword = "";
    let currentPage = 1;
    let busy = false;
    let lastResults = [];

    const safe = (value) => escapeHtml(String(value ?? ""));
    const normalizeCover = (value) => {
      if (!value) return "";
      if (value.startsWith("//")) return "https:" + value;
      return value;
    };

    contentEl.innerHTML = `
      <div class="panel-card">
        <div class="panel-head">
          <h3>音乐搜索</h3>
          <span class="chip ok">在线搜索</span>
        </div>
        <p class="panel-desc">搜索 B 站音乐相关视频，并可直接使用桌面播放器播放。</p>
        <form id="music-search-form" class="ai-search">
          <input
            id="music-search-input"
            type="search"
            placeholder="输入歌曲名称、歌手或 BV 号…"
            autocomplete="off"
          />
          <button type="submit" class="btn primary" id="music-search-submit">搜索</button>
        </form>
        <p class="panel-desc" id="music-search-status" role="status" style="margin-top:.75rem"></p>
      </div>

      <div id="music-search-results" class="panel-card" style="margin-top:1rem">
        <div class="empty-inline">输入关键词开始搜索</div>
      </div>

      <div class="panel-actions" id="music-search-pagination" style="justify-content:center;margin-top:1rem;display:none">
        <button type="button" class="btn" id="music-search-prev">上一页</button>
        <span class="chip" id="music-search-page">第 1 页</span>
        <button type="button" class="btn" id="music-search-next">下一页</button>
      </div>
    `;

    const input = document.getElementById("music-search-input");
    const form = document.getElementById("music-search-form");
    const submit = document.getElementById("music-search-submit");
    const status = document.getElementById("music-search-status");
    const resultsEl = document.getElementById("music-search-results");
    const pagination = document.getElementById("music-search-pagination");
    const prevButton = document.getElementById("music-search-prev");
    const nextButton = document.getElementById("music-search-next");
    const pageLabel = document.getElementById("music-search-page");

    const setStatus = (message, isError = false) => {
      status.textContent = message || "";
      status.style.color = isError ? "#dc2626" : "var(--ink-muted)";
    };

    const formatPlayCount = (value) => {
      const count = Number(value) || 0;
      if (count >= 10000) return (count / 10000).toFixed(1) + " 万";
      return String(count);
    };

    const renderResults = (items) => {
      lastResults = Array.isArray(items) ? items : [];

      if (!lastResults.length) {
        resultsEl.innerHTML = `<div class="empty-inline">没有找到相关结果，试试其他关键词。</div>`;
        pagination.style.display = "none";
        return;
      }

      resultsEl.innerHTML = `
        <div class="panel-head">
          <h3>搜索结果</h3>
          <span class="chip">${lastResults.length} 条</span>
        </div>
        <div class="music-search-list">
          ${lastResults.map((item, index) => {
            const cover = normalizeCover(item.cover || "");
            const title = safe(item.title || "未命名");
            const author = safe(item.author || "未知作者");
            const duration = safe(item.duration || "");
            const bvid = safe(item.bvid || "");
            const playCount = formatPlayCount(item.play);

            return `
              <div class="vb-row music-search-row">
                <div class="music-search-cover">
                  ${cover
                    ? `<img src="${safe(cover)}" alt="" loading="lazy" />`
                    : `<div class="music-search-cover-empty">♫</div>`}
                </div>
                <div class="vb-row-main music-search-info">
                  <strong title="${title}">${title}</strong>
                  <span>${author}${duration ? " · " + duration : ""} · 播放 ${playCount}</span>
                  <span class="vb-bvid">${bvid}</span>
                </div>
                <div class="vb-row-actions">
                  <button type="button" class="btn primary" data-music-play="${index}">播放</button>
                  <button type="button" class="btn soft" data-music-open="${index}">打开视频</button>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      `;

      pagination.style.display = "flex";
      pageLabel.textContent = `第 ${currentPage} 页`;
      prevButton.disabled = currentPage <= 1;
      nextButton.disabled = lastResults.length < 20;

      resultsEl.querySelectorAll("[data-music-play]").forEach((button) => {
        button.addEventListener("click", async () => {
          const index = Number(button.getAttribute("data-music-play"));
          const item = lastResults[index];
          if (!item) return;

          const player = globalThis.__bili;
          if (typeof player?.playMusic !== "function") {
            setStatus("播放器尚未初始化，请稍后重试。", true);
            return;
          }

          try {
            const track = {
              ...item,
              id: item.bvid,
              bvid: item.bvid,
              title: item.title || "未命名",
              author: item.author || "",
              cover: normalizeCover(item.cover || ""),
            };

            await player.playMusic(track, lastResults, index);
            setStatus("正在播放：" + (item.title || item.bvid));
          } catch (error) {
            setStatus("播放失败：" + (error?.message || error), true);
          }
        });
      });

      resultsEl.querySelectorAll("[data-music-open]").forEach((button) => {
        button.addEventListener("click", async () => {
          const index = Number(button.getAttribute("data-music-open"));
          const item = lastResults[index];
          if (!item?.bvid) return;

          try {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("open_external", {
              url: "https://www.bilibili.com/video/" + encodeURIComponent(item.bvid),
            });
          } catch (error) {
            setStatus("打开视频失败：" + (error?.message || error), true);
          }
        });
      });
    };

    const search = async (page = 1) => {
      const keyword = input.value.trim();
      if (!keyword) {
        setStatus("请输入歌曲名称或关键词。", true);
        input.focus();
        return;
      }
      if (busy) return;

      busy = true;
      currentKeyword = keyword;
      currentPage = Math.max(1, Number(page) || 1);
      submit.disabled = true;
      submit.textContent = "搜索中…";
      prevButton.disabled = true;
      nextButton.disabled = true;
      setStatus("正在搜索，请稍候…");
      resultsEl.innerHTML = `<div class="empty-inline">正在加载搜索结果…</div>`;

      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const items = await invoke("fetch_music_search_page", {
          keyword: currentKeyword,
          page: currentPage,
        });

        renderResults(items);
        setStatus(`搜索完成：第 ${currentPage} 页`);
      } catch (error) {
        resultsEl.innerHTML = `<div class="empty-inline">搜索失败，请检查网络或稍后重试。</div>`;
        pagination.style.display = "none";
        setStatus("搜索失败：" + (error?.message || error), true);
      } finally {
        busy = false;
        submit.disabled = false;
        submit.textContent = "搜索";
      }
    };

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void search(1);
    });

    prevButton.addEventListener("click", () => {
      if (currentPage > 1) void search(currentPage - 1);
    });

    nextButton.addEventListener("click", () => {
      if (lastResults.length >= 20) void search(currentPage + 1);
    });

    input.focus();
  };

  console.info("[desktop] secondary pages registered", Object.keys(R));
}
bootSecondary();
