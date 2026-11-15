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
    const { contentEl, pageCount, paginationEl, pack } = g();
    paginationEl.hidden = true;
    pageCount.textContent = "";
    const hist = pack?.history?.length || 0;
    contentEl.innerHTML = `
  <div class="panel-card">
    <h3>视频备份</h3>
    <p class="panel-desc">扩展支持将视频下载后上传到百度网盘，并维护备份任务队列。桌面版先提供与扩展一致的页面结构与本地备份入口；完整下载/网盘上传将按扩展逻辑逐步对齐。</p>
    <div class="kv" style="margin-top:1rem">
      <span>当前历史条数</span><span>${hist}</span>
    </div>
    <div class="kv">
      <span>备份任务队列</span><span>桌面版暂无任务（扩展侧队列）</span>
    </div>
    <div class="kv">
      <span>本地目录备份</span><span>可导出 JSON 到选定目录</span>
    </div>
    <div class="panel-actions" style="margin-top:1rem">
      <button type="button" class="btn" id="vb-goto-backup-local">本地目录备份</button>
      <button type="button" class="btn" id="vb-goto-backup-json">JSON 文件</button>
      <button type="button" class="btn primary" id="vb-goto-history">查看历史记录</button>
    </div>
    <p class="panel-desc" style="margin-top:1rem">说明：网盘登录、任务重试、编码偏好等能力与扩展一致后会在此页开放。</p>
  </div>`;
    const go = (page) => {
      const b = globalThis.__bili;
      if (b) { b.page = page; b.render?.(); }
    };
    document.getElementById("vb-goto-backup-local")?.addEventListener("click", () => go("backup-local"));
    document.getElementById("vb-goto-backup-json")?.addEventListener("click", () => go("backup-json"));
    document.getElementById("vb-goto-history")?.addEventListener("click", () => go("history"));
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
    const { contentEl, pageCount, paginationEl } = g();
    paginationEl.hidden = true;
    pageCount.textContent = "";
    contentEl.innerHTML = `
  ${pageShellNote("在线搜歌为扩展能力。可在「我喜欢的音乐」查看备份列表。")}
  <div class="ai-search">
    <input type="search" placeholder="搜索歌曲 / BV 号…" disabled />
    <button type="button" class="btn primary" disabled>搜索</button>
  </div>
  <div class="panel-card muted" style="margin-top:1rem"><div class="empty-inline">无在线搜索结果</div></div>`;
  };

  console.info("[desktop] secondary pages registered", Object.keys(R));
}
bootSecondary();
