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

export function readHardware(): {
  platform: string;
  arch: string;
  totalmem: number;
  cpuModel: string;
} {
  const os = nodeRequire<typeof import("os")>("os");
  return {
    platform: os.platform(),
    arch: os.arch(),
    totalmem: os.totalmem(),
    cpuModel: os.cpus()[0]?.model ?? ""
  };
}
