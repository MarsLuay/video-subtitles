import { Platform } from "obsidian";

export function nodeRequire<T>(moduleId: string): T {
  if (!Platform.isDesktopApp) {
    throw new Error("Creating subtitles needs desktop Obsidian");
  }
  const req = (window as unknown as { require?: (id: string) => T }).require;
  if (typeof req !== "function") {
    throw new Error(`require(${moduleId}) unavailable in this renderer`);
  }
  return req(moduleId);
}

export type NodePath = {
  join: (...parts: string[]) => string;
  resolve: (...parts: string[]) => string;
  dirname: (file: string) => string;
  sep: string;
};

export type NodeFs = {
  mkdirSync: (path: string, opts?: { recursive?: boolean }) => void;
  readFileSync: (path: string) => Uint8Array;
  writeFileSync: (path: string, data: string | Uint8Array) => void;
  existsSync: (path: string) => boolean;
  statSync: (path: string) => { size: number; isDirectory: () => boolean };
  unlinkSync: (path: string) => void;
  renameSync: (from: string, to: string) => void;
  rmSync: (path: string, opts?: { recursive?: boolean; force?: boolean }) => void;
  chmodSync: (path: string, mode: number) => void;
  createWriteStream: (path: string) => {
    on: (event: "finish" | "error", cb: (err?: Error) => void) => void;
    close: (cb?: () => void) => void;
  };
};

export type NodeOs = {
  platform: () => string;
  arch: () => string;
  totalmem: () => number;
  cpus: () => { model: string }[];
};

type HttpResponse = {
  statusCode?: number;
  headers: { location?: string };
  resume: () => void;
  pipe: (dest: { on: (event: "finish" | "error", cb: (err?: Error) => void) => void }) => void;
};

export type NodeHttp = {
  get: (
    url: string,
    opts: { headers: Record<string, string> },
    cb: (res: HttpResponse) => void
  ) => { on: (event: "error", cb: (err: Error) => void) => void };
};

export type NodeChildProcess = {
  spawn: (
    command: string,
    args: string[],
    opts: { windowsHide?: boolean }
  ) => {
    stderr?: { on: (event: "data", cb: (chunk: Uint8Array | string) => void) => void };
    on: {
      (event: "error", cb: (err: Error) => void): void;
      (event: "close", cb: (code: number | null) => void): void;
    };
  };
};

export function loadPath(): NodePath {
  return nodeRequire("path");
}

export function loadFs(): NodeFs {
  return nodeRequire("fs");
}

export function loadOs(): NodeOs {
  return nodeRequire("os");
}

export function loadHttp(): NodeHttp {
  return nodeRequire("http");
}

export function loadHttps(): NodeHttp {
  return nodeRequire("https");
}

export function loadZlib(): { gunzipSync: (bytes: Uint8Array) => Uint8Array } {
  return nodeRequire("zlib");
}

export function loadUrl(): { pathToFileURL: (file: string) => { href: string } } {
  return nodeRequire("url");
}

export function loadChildProcess(): NodeChildProcess {
  return nodeRequire("child_process");
}

export function readHardware(): {
  platform: string;
  arch: string;
  totalmem: number;
  cpuModel: string;
} {
  const os = loadOs();
  return {
    platform: os.platform(),
    arch: os.arch(),
    totalmem: os.totalmem(),
    cpuModel: os.cpus()[0]?.model ?? ""
  };
}
