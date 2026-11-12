# 桌面端方案（只读备份查看器）

## 目标

复刻扩展主界面布局，**所有展示数据来自扩展导出的备份 JSON**，不请求 B 站 API。

## 数据源

`utils/localHistoryBackup.ts` 的 `buildHistoryBackupJson()`：

- `formatVersion: 2` 对象包（推荐）
- 或旧版顶层 `HistoryItem[]`

## 目录

```
desktop/          # Tauri 2 应用
```

## 阶段

1. 打开备份、历史/收藏/音乐/合集只读列表
2. 更贴近扩展的 React UI 移植 / 虚拟列表大数据
3. 可选：导入后写入本地 SQLite，二次打开更快
