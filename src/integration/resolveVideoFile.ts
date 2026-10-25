import { FileView, TFile, type App } from "obsidian";
import { isVideoExtension } from "../videoFileTypes";

function fileFromPath(app: App, link: string, sourcePath: string): TFile | null {
  const dest = app.metadataCache.getFirstLinkpathDest(link, sourcePath)
    ?? app.vault.getAbstractFileByPath(link);
  return dest instanceof TFile && isVideoExtension(dest.extension) ? dest : null;
}

function sourcePathFor(app: App, video: HTMLVideoElement): string {
  let sourcePath = "";
  app.workspace.iterateAllLeaves((leaf) => {
    if (!leaf.view.containerEl.contains(video)) return;
    if (leaf.view instanceof FileView && leaf.view.file) {
      sourcePath = leaf.view.file.path;
    }
  });
  return sourcePath;
}

export function resolveVideoFile(app: App, video: HTMLVideoElement): TFile | null {
  const embed = video.closest(".internal-embed, .media-embed, .video-embed");
  if (embed?.instanceOf(HTMLElement)) {
    const src = embed.getAttr("src") ?? embed.getAttr("alt") ?? "";
    const link = src.split(/[?#]/)[0] ?? "";
    if (link) {
      const fromEmbed = fileFromPath(app, link, sourcePathFor(app, video));
      if (fromEmbed) return fromEmbed;
    }
  }
  for (const leaf of app.workspace.getLeavesOfType("video")) {
    if (!leaf.view.containerEl.contains(video)) continue;
    if (leaf.view instanceof FileView && leaf.view.file && isVideoExtension(leaf.view.file.extension)) {
      return leaf.view.file;
    }
  }
  return null;
}
