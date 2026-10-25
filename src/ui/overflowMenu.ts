import { Menu } from "obsidian";
import { PLAYBACK_RATES, buildSubtitleMenuRows, playbackSpeedLabel } from "./menuModel";
import type { SubtitleTrack } from "../subtitles/store";

export function openOverflowMenu(options: {
  event: MouseEvent;
  tracks: readonly SubtitleTrack[];
  activeTrackId: string | null;
  playbackRate: number;
  parent?: HTMLElement | undefined;
  onDownload: () => void;
  onRate: (rate: number) => void;
  onPip: () => void;
  onOff: () => void;
  onSelectTrack: (id: string) => void;
  onCreate: () => void;
  onImport: () => void;
}): Menu {
  const menu = new Menu();
  menu.setUseNativeMenu(false);
  if (options.parent) menu.setParentElement(options.parent);
  for (const row of buildSubtitleMenuRows({
    tracks: options.tracks,
    activeTrackId: options.activeTrackId
  })) {
    if (row.kind === "separator") {
      menu.addSeparator();
      continue;
    }
    if (row.kind === "download") {
      menu.addItem((item) => {
        item.setTitle("Download").setIcon("lucide-download").onClick(() => options.onDownload());
      });
      continue;
    }
    if (row.kind === "playback-speed") {
      menu.addItem((item) => {
        item.setTitle("Playback speed").setIcon("lucide-gauge");
        const submenu = (
          item as { setSubmenu?: () => Menu }
        ).setSubmenu?.();
        const target = submenu ?? menu;
        for (const rate of PLAYBACK_RATES) {
          target.addItem((speedItem) => {
            speedItem
              .setTitle(playbackSpeedLabel(rate))
              .setChecked(Math.abs(options.playbackRate - rate) < 0.001)
              .onClick(() => options.onRate(rate));
          });
        }
      });
      continue;
    }
    if (row.kind === "pip") {
      menu.addItem((item) => {
        item.setTitle("Picture in picture").setIcon("lucide-picture-in-picture-2").onClick(() => options.onPip());
      });
      continue;
    }
    if (row.kind === "off") {
      menu.addItem((item) => {
        item.setTitle("Off").setChecked(row.checked).onClick(() => options.onOff());
      });
      continue;
    }
    if (row.kind === "track") {
      menu.addItem((item) => {
        item.setTitle(row.label).setChecked(row.checked).onClick(() => options.onSelectTrack(row.id));
      });
      continue;
    }
    if (row.kind === "create") {
      menu.addItem((item) => {
        item.setTitle("Create").setIcon("lucide-captions").onClick(() => options.onCreate());
      });
      continue;
    }
    menu.addItem((item) => {
      item.setTitle("Import").setIcon("lucide-folder-open").onClick(() => options.onImport());
    });
  }
  const doc = (options.event.target instanceof Node
    ? options.event.target.ownerDocument
    : options.event.view?.document) ?? undefined;
  menu.showAtPosition({ x: options.event.clientX, y: options.event.clientY }, doc);
  mountMenuInParent(options.parent);
  return menu;
}

/** Fullscreen top layer hides body menus; keep the overflow list inside the player. */
export function mountMenuInParent(parent: HTMLElement | undefined): void {
  if (!parent) return;
  const menus = parent.ownerDocument.body.querySelectorAll(":scope > .menu");
  const menuEl = menus.item(menus.length - 1);
  if (menuEl?.instanceOf(HTMLElement)) parent.append(menuEl);
}

export function toggleOverflowMenu(
  current: Menu | null,
  options: Parameters<typeof openOverflowMenu>[0]
): Menu | null {
  if (current) {
    current.hide();
    return null;
  }
  return openOverflowMenu(options);
}
