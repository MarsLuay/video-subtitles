import type { Menu } from "obsidian";
import { buildSubtitleMenuRows } from "./menuModel";
import type { SubtitleTrack } from "../subtitles/store";

export function addSubtitleMenuItems(menu: Menu, options: {
  tracks: readonly SubtitleTrack[];
  activeTrackId: string | null;
  onOff: () => void;
  onSelectTrack: (id: string) => void;
  onImport: () => void;
}): void {
  for (const row of buildSubtitleMenuRows({
    tracks: options.tracks,
    activeTrackId: options.activeTrackId
  })) {
    if (row.kind === "off") {
      menu.addItem((item) => {
        item.setSection("action").setTitle("Off").setChecked(row.checked).onClick(() => options.onOff());
      });
      continue;
    }
    if (row.kind === "track") {
      menu.addItem((item) => {
        item.setSection("action").setTitle(row.label).setChecked(row.checked).onClick(() => options.onSelectTrack(row.id));
      });
      continue;
    }
    menu.addItem((item) => {
      item.setSection("action").setTitle("Import").setIcon("lucide-folder-open").onClick(() => options.onImport());
    });
  }
}
