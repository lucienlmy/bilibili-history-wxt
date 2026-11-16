# Bilibili 无限历史记录 · Desktop（只读备份查看器）

桌面端复刻扩展主界面，**不连接 B 站 API**。  
数据来自浏览器扩展导出的备份 JSON（`formatVersion: 2` 或历史顶层数组）。

## 支持的备份

扩展导出 / 本地自动备份生成的文件，例如：

- `bilibili-history-YYYY-MM-DD.json`
- `bilibili-history-YYYY-MM-DD-HHmmss.json`

推荐完整包结构：

```json
{
  "formatVersion": 2,
  "exportedAt": "2026-11-12T00:00:00.000Z",
  "history": [],
  "historyEvents": [],
  "historyTombstones": [],
  "likedMusic": [],
  "favFolders": [],
  "favResources": [],
  "subscribedCollections": [],
  "subscribedCollectionResources": []
}
```

也兼容旧版：顶层直接是 `HistoryItem[]`。

## 开发

需要 Node.js 20+、Rust、[Tauri 依赖](https://v2.tauri.app/start/prerequisites/)。

```bash
cd desktop
npm install
python scripts/generate_icons.py
npm run tauri:dev
```

## 使用

1. 启动应用
2. 点击「打开备份」选择扩展导出的 JSON
3. 在侧边栏切换：历史 / 收藏 / 音乐 / 合集
4. 搜索、滚动浏览；点击条目在浏览器打开 B 站链接

## 说明

- 本阶段为**只读查看**，不含同步、WebDAV、AI 搜索写操作
- 封面图依赖网络；无网时标题等信息仍可看
