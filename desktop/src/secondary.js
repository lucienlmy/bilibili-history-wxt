/** Secondary page UI shells for desktop read-only viewer */
function bootSecondary() {
  const R = globalThis.__BILI_PAGE_RENDERERS || (globalThis.__BILI_PAGE_RENDERERS = {});
  const api = () => globalThis.__bili;
  if (!api()) {
    setTimeout(bootSecondary, 50);
    return;
  }
  const g = () => api();
  const pageShellNote = (text) => `<div class="note-banner">${text}</div>`;
  const settingRow = (title, desc, controlHtml, disabled = true) =>
    `<div class="setting-card${disabled ? " is-disabled" : ""}">
    <div class="setting-card-text"><h3>${title}</h3><p>${desc}</p></div>
    <div class="setting-card-ctrl">${controlHtml}</div>
  </div>`;

  R.settings = function () {
    const { contentEl, pageCount, paginationEl, pack, sourceName, cols, PAGE_SIZE, colsEl, escapeHtml, openBackup } = g();
    paginationEl.hidden = true;
    pageCount.textContent = "";
    const hist = pack?.history?.length || 0;
    const visits = pack?.historyEvents?.length || 0;
    const favs = pack?.favFolders?.length || 0;
    const music = pack?.likedMusic?.length || 0;
    contentEl.innerHTML = `
  ${pageShellNote("桌面只读版：视图相关项可改；同步 / 清理 / 扩展存储等仅展示界面，不生效。")}
  <div class="settings-grid">
    <section class="settings-col">
      <h2 class="settings-col-title">数据与存储管理</h2>
      ${settingRow("当前备份", sourceName ? escapeHtml(sourceName) : "尚未加载", `<button type="button" class="btn primary" id="set-open">打开备份</button>`, false)}
      ${settingRow("本地数据概览", `历史 ${hist} · 观看事件 ${visits} · 收藏夹 ${favs} · 音乐 ${music}`, `<span class="chip">只读</span>`)}
      ${settingRow("首次引导", "扩展内可重新查看历史记录和备份介绍", `<button type="button" class="btn soft" disabled>重新查看</button>`)}
      ${settingRow("本地存储保护", "扩展检查 IndexedDB 持久化；桌面版使用打开的 JSON 文件", `<span class="chip ok">文件模式</span>`)}
      ${settingRow("恢复出厂设置", "扩展可清空应用数据；桌面版请直接关闭或重新打开备份", `<button type="button" class="btn danger" disabled>恢复出厂</button>`)}
    </section>
    <section class="settings-col">
      <h2 class="settings-col-title">同步与界面偏好</h2>
      ${settingRow("历史自动同步间隔", "单位：分钟（扩展功能）", `<div class="stepper"><button type="button" disabled>-</button><input value="30" disabled /><button type="button" disabled>+</button></div>`)}
      ${settingRow("同步删除本地记录", "在 B 站删除后同步到本地", `<label class="switch"><input type="checkbox" checked disabled><span></span></label>`)}
      ${settingRow("同步删除 B 站记录", "在本地删除后尝试同步到 B 站", `<label class="switch"><input type="checkbox" checked disabled><span></span></label>`)}
      ${settingRow("网格列数", "历史卡片列数", `<select id="set-cols"><option value="auto">自动</option><option value="3">3 列</option><option value="4">4 列</option><option value="5">5 列</option></select>`, false)}
      ${settingRow("每页条数", "历史 / 收藏分页大小", `<select id="set-page-size"><option value="50">50</option><option value="100">100</option><option value="200">200</option></select>`, false)}
      ${settingRow("隐藏菜单项", "扩展可隐藏侧栏入口；桌面版侧栏固定展示", `<span class="chip">不可用</span>`)}
    </section>
  </div>`;
    const setCols = document.getElementById("set-cols");
    const setPs = document.getElementById("set-page-size");
    if (setCols) setCols.value = cols;
    if (setPs) setPs.value = String(PAGE_SIZE);
    document.getElementById("set-open")?.addEventListener("click", () => void openBackup());
    setCols?.addEventListener("change", () => {
      g().cols = setCols.value;
      if (colsEl) colsEl.value = setCols.value;
    });
    setPs?.addEventListener("change", () => {
      g().PAGE_SIZE = Number(setPs.value) || 100;
    });
  };

  R.cloud = function () {
    const { contentEl, pageCount, paginationEl } = g();
    paginationEl.hidden = true;
    pageCount.textContent = "";
    contentEl.innerHTML = `
  ${pageShellNote("云同步仅扩展支持。以下为界面还原，按钮不可用。")}
  <div class="panel-stack">
    <div class="panel-card">
      <div class="panel-head"><h3>云同步状态</h3><span class="chip">未连接</span></div>
      <p class="panel-desc">将本地历史与收藏同步到云端，便于多端使用。</p>
      <div class="kv"><span>当前账号</span><span>未登录</span></div>
      <div class="kv"><span>上次同步</span><span>—</span></div>
      <div class="panel-actions">
        <button type="button" class="btn primary" disabled>立即同步</button>
        <button type="button" class="btn" disabled>登录账号</button>
      </div>
    </div>
    <div class="panel-card">
      <h3>同步内容</h3>
      <label class="check-line"><input type="checkbox" checked disabled> 历史记录</label>
      <label class="check-line"><input type="checkbox" checked disabled> 收藏夹</label>
      <label class="check-line"><input type="checkbox" checked disabled> 喜欢的音乐</label>
      <label class="check-line"><input type="checkbox" disabled> 合集订阅</label>
    </div>
  </div>`;
  };

  R["video-backup"] = function () {
    const { contentEl, pageCount, paginationEl } = g();
    paginationEl.hidden = true;
    pageCount.textContent = "";
    contentEl.innerHTML = `
  ${pageShellNote("视频备份为扩展能力。桌面版仅展示界面结构。")}
  <div class="panel-stack">
    <div class="panel-card">
      <div class="panel-head"><h3>视频备份</h3><span class="chip">不可用</span></div>
      <p class="panel-desc">将收藏或历史上的视频缓存到本地目录，便于离线查看。</p>
      <div class="kv"><span>备份目录</span><span>未选择</span></div>
      <div class="kv"><span>已备份</span><span>0</span></div>
      <div class="panel-actions">
        <button type="button" class="btn primary" disabled>选择目录</button>
        <button type="button" class="btn" disabled>开始备份</button>
      </div>
    </div>
  </div>`;
  };

  R.ai = function () {
    const { contentEl, pageCount, paginationEl } = g();
    paginationEl.hidden = true;
    pageCount.textContent = "";
    contentEl.innerHTML = `
  ${pageShellNote("AI 探索依赖扩展内 API Key。桌面版不发起模型请求。")}
  <div class="ai-shell">
    <div class="ai-toolbar">
      <button type="button" class="btn" disabled>模型配置</button>
      <select disabled><option>最近 1000 条</option></select>
    </div>
    <div class="ai-search">
      <input type="search" placeholder="用自然语言搜索你的观看历史…" disabled />
      <button type="button" class="btn primary" disabled>开始探索</button>
    </div>
    <div class="panel-card muted"><div class="empty-inline">请在扩展中使用 AI 探索</div></div>
  </div>`;
  };

  R.feedback = function () {
    const { contentEl, pageCount, paginationEl } = g();
    paginationEl.hidden = true;
    pageCount.textContent = "";
    contentEl.innerHTML = `
  ${pageShellNote("反馈请到扩展仓库提交。")}
  <div class="panel-card">
    <h3>反馈与建议</h3>
    <p class="panel-desc">桌面只读版不内置反馈表单。</p>
    <label class="field-block"><span>类型</span><select disabled><option>功能建议</option><option>问题反馈</option></select></label>
    <label class="field-block"><span>内容</span><textarea rows="5" disabled placeholder="描述你的问题或建议…"></textarea></label>
    <div class="panel-actions">
      <button type="button" class="btn primary" disabled>提交</button>
      <a class="btn" href="https://github.com/lucienlmy/bilibili-history-wxt/issues" target="_blank" rel="noopener">打开 GitHub Issues</a>
    </div>
  </div>`;
  };

  R.reward = function () {
    const { contentEl, pageCount, paginationEl } = g();
    paginationEl.hidden = true;
    pageCount.textContent = "";
    contentEl.innerHTML = `
  <div class="panel-card center">
    <h3>赞赏支持</h3>
    <p class="panel-desc">感谢支持。桌面版不展示收款码，请在扩展或项目页查看。</p>
    <div class="reward-placeholder">♥</div>
    <div class="panel-actions center">
      <a class="btn primary" href="https://github.com/lucienlmy/bilibili-history-wxt" target="_blank" rel="noopener">前往项目主页</a>
    </div>
  </div>`;
  };

  R["backup-local"] = function () {
    const { contentEl, pageCount, paginationEl, openBackup } = g();
    paginationEl.hidden = true;
    pageCount.textContent = "";
    contentEl.innerHTML = `
  ${pageShellNote("本地目录备份为扩展能力。桌面请直接打开 JSON。")}
  <div class="panel-card">
    <div class="panel-head"><h3>本地目录</h3><span class="chip">扩展功能</span></div>
    <p class="panel-desc">授权文件夹后扩展可自动写入备份。</p>
    <div class="panel-actions">
      <button type="button" class="btn primary" id="bl-open">打开 JSON 备份</button>
      <button type="button" class="btn" disabled>选择目录</button>
    </div>
  </div>`;
    document.getElementById("bl-open")?.addEventListener("click", () => void openBackup());
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
    <p class="panel-desc">打开扩展导出的备份 JSON。</p>
    <div class="kv"><span>当前文件</span><span>${escapeHtml(sourceName || "未加载")}</span></div>
    <div class="kv"><span>导出时间</span><span>${escapeHtml(pack?.exportedAt || "—")}</span></div>
    <div class="panel-actions">
      <button type="button" class="btn primary" id="bj-open">打开备份</button>
    </div>
  </div>`;
    document.getElementById("bj-open")?.addEventListener("click", () => void openBackup());
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
