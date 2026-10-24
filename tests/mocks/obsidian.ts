export class Plugin {
  app: { workspace: { containerEl: HTMLElement }; vault: Record<string, unknown> };
  manifest: { id: string; version: string };
  constructor() {
    this.app = {
      workspace: { containerEl: document.createElement("div") },
      vault: {}
    };
    this.manifest = { id: "video-subtitles", version: "0.1.0" };
  }
  addCommand(): void {}
  register(): void {}
  registerEvent(): void {}
  registerDomEvent(): void {}
}

export class Notice {
  constructor(_message: string) {}
}

export class Menu {
  addItem(cb: (item: MenuItem) => void): this {
    cb(new MenuItem());
    return this;
  }
  addSeparator(): this {
    return this;
  }
  showAtMouseEvent(_event: MouseEvent): void {}
  showAtPosition(_position: { x: number; y: number }): void {}
}

export class MenuItem {
  setTitle(_title: string): this {
    return this;
  }
  setIcon(_icon: string): this {
    return this;
  }
  setChecked(_checked: boolean): this {
    return this;
  }
  setSection(_section: string): this {
    return this;
  }
  setSubmenu(): Menu {
    return new Menu();
  }
  onClick(_cb: () => void): this {
    return this;
  }
}

export class TFile {
  path = "";
  name = "";
  extension = "";
}

export class FileView {
  file: TFile | null = null;
  containerEl: HTMLElement = document.createElement("div");
}

export function setIcon(el: HTMLElement, icon: string): void {
  el.dataset.icon = icon;
}

export type App = Plugin["app"];
export type WorkspaceLeaf = {
  view: FileView;
};
