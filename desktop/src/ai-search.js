/**
 * Desktop AI semantic search.
 * Mirrors the extension's OpenAI-compatible chat-completions workflow.
 * Loaded after secondary.js and replaces its placeholder renderer.
 */
(() => {
  "use strict";

  const KEYS = {
    apiKey: "openaiApiKey",
    baseUrl: "openaiBaseUrl",
    model: "openaiModel",
    history: "aiSearchHistory",
  };
  const DEFAULT_BASE_URL = "https://api.openai.com/v1";
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[ch]);

  const read = (key, fallback) => {
    try {
      const value = localStorage.getItem(key);
      return value == null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const completionsUrl = (baseUrl) => {
    const normalized = String(baseUrl || "").trim().replace(/\/+$/, "");
    return normalized.endsWith("/chat/completions")
      ? normalized
      : `${normalized}/chat/completions`;
  };

  function install() {
    const R = globalThis.__BILI_PAGE_RENDERERS;
    if (!R || typeof R.ai !== "function") return false;

    R.ai = function renderAiSearch() {
      const b = globalThis.__bili || {};
      const contentEl = b.contentEl;
      if (!contentEl) return;
      b.paginationEl && (b.paginationEl.hidden = true);
      if (b.pageCount) b.pageCount.textContent = "";

      const settings = {
        apiKey: read(KEYS.apiKey, ""),
        baseUrl: read(KEYS.baseUrl, DEFAULT_BASE_URL),
        model: read(KEYS.model, ""),
      };
      let logs = read(KEYS.history, []);
      if (!Array.isArray(logs)) logs = [];
      let query = "";
      let reasoning = "";
      let answer = "";
      let error = "";
      let loading = false;
      let hasStarted = false;
      let answering = false;
      let searchCount = 1000;

      const render = () => {
        contentEl.innerHTML = `
          <div class="ai-workspace">
            <aside class="ai-history">
              <div class="ai-history-head"><strong>探索历史</strong><button class="btn" id="ai-clear-history" type="button">清空</button></div>
              <div class="ai-history-list" id="ai-history-list">
                ${logs.length ? logs.map((item) => `
                  <div class="ai-history-item" data-ai-log="${esc(item.id)}">
                    <button type="button" class="ai-history-load" data-ai-load="${esc(item.id)}">
                      <strong>${esc(item.query)}</strong>
                      <small>${esc(new Date(item.timestamp || 0).toLocaleString())}</small>
                    </button>
                    <button type="button" class="ai-history-delete" data-ai-delete="${esc(item.id)}" title="删除">×</button>
                  </div>`).join("") : `<div class="empty-inline">暂无搜索历史</div>`}
              </div>
            </aside>
            <section class="ai-main">
              <div class="panel-card">
                <div class="panel-head">
                  <h3>✨ AI 语义搜索</h3>
                  <button class="btn soft" id="ai-config" type="button">${esc(settings.model || "配置模型")}</button>
                </div>
                <p class="panel-desc">用自然语言描述你曾经看过、但忘记标题或 UP 主的视频。AI 会结合本地历史记录进行匹配。</p>
                <div class="ai-toolbar">
                  <select id="ai-count" aria-label="参与搜索的历史记录数量">
                    <option value="500">最近 500 条</option>
                    <option value="1000" selected>最近 1000 条</option>
                    <option value="3000">最近 3000 条</option>
                    <option value="5000">最近 5000 条</option>
                  </select>
                  <span class="chip">${(b.pack?.history || []).length} 条本地历史</span>
                </div>
                <div class="ai-search">
                  <input id="ai-query" type="search" placeholder="例如：那个讲量子力学把爱情解释得很搞笑的视频…" value="${esc(query)}" />
                  <button id="ai-start" class="btn primary" type="button" ${loading ? "disabled" : ""}>${loading ? "搜索中…" : "开始搜索"}</button>
                </div>
                ${!settings.apiKey || !settings.baseUrl || !settings.model
                  ? `<p class="ai-warning">首次使用请先配置 OpenAI 兼容接口。</p>` : ""}
                ${hasStarted ? `
                  <div class="ai-result-grid">
                    ${reasoning ? `<section class="panel-card ai-reasoning"><h4>${answering ? "💡 思考过程" : "⏳ 深度思考中…"}</h4><div class="ai-output" id="ai-reasoning">${esc(reasoning)}</div></section>` : ""}
                    <section class="panel-card ai-answer">
                      <h4>🎯 搜索结果</h4>
                      <div class="ai-output" id="ai-answer">${esc(answer || (loading ? "正在分析本地历史记录…" : "暂无结果"))}</div>
                    </section>
                  </div>
                  ${error ? `<div class="panel-card ai-error"><strong>搜索出错</strong><p>${esc(error)}</p></div>` : ""}
                  <div class="panel-actions"><button id="ai-new" class="btn" type="button">开启新探索</button></div>
                ` : ""}
              </div>
            </section>
          </div>
          <div class="modal-mask" id="ai-config-modal" hidden>
            <form class="modal ai-config-modal" id="ai-config-form" role="dialog" aria-modal="true">
              <div class="modal-head"><h2>OpenAI 兼容配置</h2><button type="button" class="icon-btn" id="ai-config-close" aria-label="关闭">✕</button></div>
              <div class="modal-body">
                <label class="field-block">Base URL<input id="ai-base-url" type="url" required value="${esc(settings.baseUrl)}" placeholder="${DEFAULT_BASE_URL}"></label>
                <label class="field-block">API Key<input id="ai-api-key" type="password" required autocomplete="off" value="${esc(settings.apiKey)}"></label>
                <label class="field-block">模型<input id="ai-model" type="text" required value="${esc(settings.model)}" placeholder="例如 gpt-4.1-mini"></label>
                <p class="panel-desc">密钥仅保存在本机浏览器存储中，并在请求时发送到你配置的 API 服务。</p>
              </div>
              <div class="modal-foot"><button type="button" class="btn" id="ai-config-cancel">取消</button><button type="submit" class="btn primary">保存配置</button></div>
            </form>
          </div>`;

        const countEl = contentEl.querySelector("#ai-count");
        if (countEl) countEl.value = String(searchCount);
        contentEl.querySelector("#ai-config")?.addEventListener("click", () => {
          contentEl.querySelector("#ai-config-modal").hidden = false;
        });
        const closeConfig = () => { contentEl.querySelector("#ai-config-modal").hidden = true; };
        contentEl.querySelector("#ai-config-close")?.addEventListener("click", closeConfig);
        contentEl.querySelector("#ai-config-cancel")?.addEventListener("click", closeConfig);
        contentEl.querySelector("#ai-config-modal")?.addEventListener("mousedown", (event) => {
          if (event.target.id === "ai-config-modal") closeConfig();
        });
        contentEl.querySelector("#ai-config-form")?.addEventListener("submit", (event) => {
          event.preventDefault();
          const next = {
            apiKey: contentEl.querySelector("#ai-api-key").value.trim(),
            baseUrl: contentEl.querySelector("#ai-base-url").value.trim().replace(/\/+$/, ""),
            model: contentEl.querySelector("#ai-model").value.trim(),
          };
          if (!next.apiKey || !next.baseUrl || !next.model) return;
          settings.apiKey = next.apiKey;
          settings.baseUrl = next.baseUrl;
          settings.model = next.model;
          write(KEYS.apiKey, next.apiKey);
          write(KEYS.baseUrl, next.baseUrl);
          write(KEYS.model, next.model);
          render();
        });
        countEl?.addEventListener("change", () => { searchCount = Number(countEl.value) || 1000; });
        contentEl.querySelector("#ai-query")?.addEventListener("input", (event) => { query = event.target.value; });
        contentEl.querySelector("#ai-query")?.addEventListener("keydown", (event) => {
          if (event.key === "Enter" && !loading) void startSearch();
        });
        contentEl.querySelector("#ai-start")?.addEventListener("click", () => void startSearch());
        contentEl.querySelector("#ai-new")?.addEventListener("click", () => {
          query = ""; reasoning = ""; answer = ""; error = ""; hasStarted = false; answering = false; render();
        });
        contentEl.querySelectorAll("[data-ai-load]").forEach((button) => button.addEventListener("click", () => {
          const item = logs.find((log) => String(log.id) === button.dataset.aiLoad);
          if (!item) return;
          query = item.query || ""; reasoning = item.reasoning || ""; answer = item.content || "";
          hasStarted = true; answering = true; error = ""; render();
        }));
        contentEl.querySelectorAll("[data-ai-delete]").forEach((button) => button.addEventListener("click", () => {
          logs = logs.filter((item) => String(item.id) !== button.dataset.aiDelete);
          write(KEYS.history, logs); render();
        }));
        contentEl.querySelector("#ai-clear-history")?.addEventListener("click", () => {
          if (!logs.length || !confirm("确定清空全部 AI 探索历史？")) return;
          logs = []; write(KEYS.history, logs); render();
        });
      };

      const updateOutput = () => {
        const r = contentEl.querySelector("#ai-reasoning");
        const a = contentEl.querySelector("#ai-answer");
        if (r) r.textContent = reasoning;
        if (a) a.textContent = answer || (loading ? "正在分析本地历史记录…" : "");
      };

      async function startSearch() {
        if (loading) return;
        if (!settings.apiKey || !settings.baseUrl || !settings.model) {
          contentEl.querySelector("#ai-config-modal").hidden = false;
          return;
        }
        query = contentEl.querySelector("#ai-query")?.value ?? query;
        if (!query.trim()) return;
        const history = Array.isArray(b.pack?.history) ? b.pack.history : [];
        if (!history.length) {
          hasStarted = true;
          error = "当前没有可供 AI 检索的本地历史记录。请先在右上角同步记录，或打开已有 JSON 备份。";
          answer = ""; reasoning = ""; loading = false; render(); return;
        }

        const recent = history.slice(0, searchCount);
        const historyText = recent.map((item) => {
          const title = item.title || "未命名";
          const author = item.author_name || item.author || item.upper?.name || "未知 UP 主";
          const bvid = item.bvid || item.bv_id || "";
          const viewAt = Number(item.view_at || item.viewAt || 0);
          const date = viewAt ? new Date(viewAt * 1000).toLocaleString() : "时间未知";
          const url = bvid ? `https://www.bilibili.com/video/${bvid}` : (item.uri || "");
          return `[${date}] ${title}（UP主：${author}）${url ? ` - 链接：${url}` : ""}`;
        }).join("\n");

        loading = true; hasStarted = true; answering = false;
        reasoning = ""; answer = ""; error = "";
        render();
        const update = () => updateOutput();
        try {
          const response = await fetch(completionsUrl(settings.baseUrl), {
            method: "POST",
            headers: {
              Authorization: `Bearer ${settings.apiKey}`,
              "Content-Type": "application/json",
              Accept: "text/event-stream",
            },
            body: JSON.stringify({
              model: settings.model,
              stream: true,
              messages: [
                { role: "system", content: `你是一个深度的 B 站历史记录搜索助手。用户会用模糊语义或零碎回忆寻找看过的视频。请从下面最近 ${recent.length} 条历史记录中匹配，给出准确或最接近的候选，包含完整标题、UP主和原始链接；没有匹配时诚实说明。\n\n本地历史记录：\n${historyText}` },
                { role: "user", content: query },
              ],
            }),
          });
          if (!response.ok) {
            const body = await response.text();
            throw new Error(`HTTP ${response.status}${body ? `：${body.slice(0, 1200)}` : ""}`);
          }

          const append = (payload) => {
            const choice = payload?.choices?.[0];
            const delta = choice?.delta || choice?.message || {};
            const reason = delta.reasoning_content ?? delta.reasoning;
            const content = delta.content;
            if (typeof reason === "string") reasoning += reason;
            if (typeof content === "string") { answer += content; answering = true; }
            update();
          };

          const reader = response.body?.getReader();
          const contentType = response.headers.get("content-type") || "";
          if (reader && (contentType.includes("text/event-stream") || contentType.includes("stream"))) {
            const decoder = new TextDecoder();
            let buffer = "";
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split(/\r?\n/);
              buffer = lines.pop() || "";
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith("data:")) continue;
                const data = trimmed.slice(5).trim();
                if (!data || data === "[DONE]") continue;
                try { append(JSON.parse(data)); } catch { /* Ignore malformed SSE frames. */ }
              }
            }
            buffer += decoder.decode();
            const tail = buffer.trim();
            if (tail.startsWith("data:")) {
              const data = tail.slice(5).trim();
              if (data && data !== "[DONE]") append(JSON.parse(data));
            }
          } else {
            const payload = await response.json();
            append(payload);
          }

          if (answer) {
            logs = [{
              id: String(Date.now()),
              query,
              reasoning,
              content: answer,
              timestamp: Date.now(),
            }, ...logs].slice(0, 50);
            write(KEYS.history, logs);
          }
        } catch (err) {
          console.error("[desktop] AI search failed", err);
          error = err?.message || String(err) || "请求发生未知错误";
        } finally {
          loading = false;
          if (!answer && !error) answer = "接口未返回可显示的文本内容。请检查模型是否支持 Chat Completions。";
          render();
        }
      }

      render();
    };

    console.info("[desktop] AI semantic search renderer registered");
    return true;
  }

  if (!install()) {
    const timer = setInterval(() => {
      if (install()) clearInterval(timer);
    }, 20);
    setTimeout(() => clearInterval(timer), 5000);
  }
})();
