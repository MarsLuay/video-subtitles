import { Menu } from "obsidian";
import { PLAYBACK_RATES, buildSubtitleMenuRows, playbackSpeedLabel } from "./menuModel";
import type { SubtitleTrack } from "../subtitles/store";

export function openOverflowMenu(options: {
  event: MouseEvent;
  tracks: readonly SubtitleTrack[];
  activeTrackId: string | null;
  playbackRate: number;
  onDownload: () => void;
  onRate: (rate: number) => void;
  onPip: () => void;
  onOff: () => void;
  onSelectTrack: (id: string) => void;
  onImport: () => void;
}): void {
  const menu = new Menu();
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
        item.setTitle("Download").onClick(() => options.onDownload());
      });
      continue;
    }
    if (row.kind === "playback-speed") {
      menu.addItem((item) => {
        item.setTitle("Playback speed");
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
        item.setTitle("Picture in picture").onClick(() => options.onPip());
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
    menu.addItem((item) => {
      item.setTitle("Import").setIcon("lucide-folder-open").onClick(() => options.onImport());
    });
  }
  menu.showAtMouseEvent(options.event);
}
