/** Matches Obsidian 1.14.5 `Ex` video extensions. */
export const VIDEO_EXTENSIONS = ["mp4", "webm", "ogv", "mov", "mkv"] as const;

export type VideoExtension = (typeof VIDEO_EXTENSIONS)[number];

const VIDEO_EXTENSION_SET = new Set<string>(VIDEO_EXTENSIONS);

export function isVideoExtension(extension: string): boolean {
  return VIDEO_EXTENSION_SET.has(extension.toLowerCase());
}

export function isIsoBmffExtension(extension: string): boolean {
  const lower = extension.toLowerCase();
  return lower === "mp4" || lower === "mov" || lower === "m4v";
}
