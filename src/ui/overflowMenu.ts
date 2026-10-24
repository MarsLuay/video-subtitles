import { Menu, type App } from "obsidian";
import { buildSubtitleMenuRows } from "./menuModel";
import type { SubtitleTrack } from "../subtitles/store";

export function openOverflowMenu(options: {
  event: MouseEvent;
  app: App;
  tracks: readonly SubtitleTrack[];
  activeTrackId: string | null;
  playbackRate: number;
  onOff: () => void;
  onSelectTrack: (id: string) => void;
  onImport: () => void;
  onRate: (rate: number) => void;
  onPip: () => void;
}): void {
  const menu = new Menu();
  for (const row of buildSubtitleMenuRows({
    tracks: options.tracks,
    activeTrackId: options.activeTrackId,
    playbackRate: options.playbackRate
  })) {
    if (row.kind === "separator") {
      menu.addSeparator();
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
    if (row.kind === "import") {
      menu.addItem((item) => {
        item.setTitle("Import").setIcon("lucide-folder-open").onClick(() => options.onImport());
      });
      continue;
    }
    if (row.kind === "rate") {
      menu.addItem((item) => {
        item.setTitle(`${row.rate}×`).setChecked(row.checked).onClick(() => options.onRate(row.rate));
      });
      continue;
    }
    menu.addItem((item) => {
      item.setTitle("Picture in picture").setIcon("lucide-picture-in-picture-2").onClick(() => options.onPip());
    });
  }
  menu.showAtMouseEvent(options.event);
}
