/**
 * 桌面版的 FileSystemDirectoryHandle 兼容实现。
 *
 * 扩展的本地目录备份整体基于 File System Access API。Tauri WebView 没有这套 API，
 * 这里用 dialog 选目录 + fs 插件读写，造出一个"带方法的普通对象"来模拟目录句柄。
 * 注意：这个对象不能直接存进 IndexedDB（函数会被结构化克隆丢弃），所以持久化时
 * 只存 { name, path }，取出后再用 createDesktopDirectoryHandle 套上方法。
 */

type PermMode = { mode: "read" | "readwrite" };

export interface DesktopDirectoryHandle {
  kind: "directory";
  name: string;
  __desktopPath: string;
  queryPermission: (desc?: PermMode) => Promise<"granted" | "denied">;
  requestPermission: (desc?: PermMode) => Promise<"granted" | "denied">;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<DesktopFileHandle>;
  entries: () => AsyncGenerator<[string, { kind: "file"; name: string }]>;
  removeEntry: (name: string) => Promise<void>;
}

export interface DesktopFileHandle {
  kind: "file";
  name: string;
  createWritable: () => Promise<{
    write: (data: string) => Promise<void>;
    close: () => Promise<void>;
    abort: () => Promise<void>;
  }>;
}

const notFoundError = (name: string) => {
  const error = new DOMException(`文件不存在：${name}`, "NotFoundError");
  return error;
};

const loadFs = () => import("@tauri-apps/plugin-fs");

const join = (dir: string, name: string) => {
  const trimmed = dir.replace(/[\\/]+$/, "");
  const sep = trimmed.includes("\\") && !trimmed.includes("/") ? "\\" : "/";
  return `${trimmed}${sep}${name}`;
};

export const createDesktopDirectoryHandle = (
  path: string,
  name?: string,
): DesktopDirectoryHandle => {
  const dirPath = path;
  const dirName = name || path.split(/[\\/]/).filter(Boolean).pop() || "backup";

  const handle: DesktopDirectoryHandle = {
    kind: "directory",
    name: dirName,
    __desktopPath: dirPath,

    async queryPermission() {
      return "granted";
    },
    async requestPermission() {
      return "granted";
    },

    async getFileHandle(fileName, options) {
      const { readDir } = await loadFs();
      let exists = false;
      try {
        const entries = await readDir(dirPath);
        exists = entries.some((entry: any) => entry.name === fileName);
      } catch {
        exists = false;
      }
      if (!exists && !options?.create) throw notFoundError(fileName);

      return {
        kind: "file",
        name: fileName,
        async createWritable() {
          let buffer = "";
          return {
            async write(data: string) {
              buffer += data;
            },
            async close() {
              const { writeTextFile } = await loadFs();
              await writeTextFile(join(dirPath, fileName), buffer);
              buffer = "";
            },
            async abort() {
              buffer = "";
            },
          };
        },
      };
    },

    async *entries() {
      const { readDir } = await loadFs();
      const list = await readDir(dirPath);
      for (const entry of list) {
        if ((entry as any).isDirectory) continue;
        yield [entry.name, { kind: "file" as const, name: entry.name }];
      }
    },

    async removeEntry(fileName) {
      const { remove } = await loadFs();
      await remove(join(dirPath, fileName));
    },
  };

  return handle;
};

/** polyfill 用：弹出 Tauri 目录选择框，返回桌面版目录句柄；取消时抛 AbortError。 */
export const pickDesktopDirectory = async (): Promise<DesktopDirectoryHandle> => {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({ directory: true, multiple: false, title: "选择备份目录" });
  if (typeof selected !== "string") {
    throw new DOMException("用户取消了目录选择", "AbortError");
  }
  return createDesktopDirectoryHandle(selected);
};
