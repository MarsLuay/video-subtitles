export class Plugin {
  app: { workspace: { containerEl: HTMLElement }; vault: Record<string, unknown> };
  manifest: { id: string; version: string; dir?: string };
  constructor() {
    this.app = {
      workspace: { containerEl: document.createElement("div") },
      vault: {}
    };
    this.manifest = { id: "video-subtitles", version: "0.2.0", dir: ".obsidian/plugins/video-subtitles" };
  }
  addCommand(): void {}
  addSettingTab(): void {}
  async loadData(): Promise<unknown> {
    return {};
  }
  async saveData(_data: unknown): Promise<void> {}
  register(): void {}
  registerEvent(): void {}
  registerDomEvent(): void {}
}

export class Notice {
  message: string;
  constructor(message: string, _timeout?: number) {
    this.message = message;
  }
  setMessage(message: string): this {
    this.message = message;
    return this;
  }
  hide(): void {}
}

export const Platform = {
  isDesktopApp: true
};

export class FileSystemAdapter {
  getBasePath(): string {
    return "/vault";
  }
}

export class Modal {
  titleEl: HTMLElement;
  contentEl: HTMLElement;
  constructor(_app: Plugin["app"]) {
    this.titleEl = document.createElement("h2");
    (this.titleEl as HTMLElement & { setText(value: string): void }).setText = (value: string) => {
      this.titleEl.textContent = value;
    };
    this.contentEl = document.createElement("div");
  }
  open(): this {
    this.onOpen();
    return this;
  }
  close(): void {
    this.onClose();
  }
  onOpen(): void {}
  onClose(): void {}
}

export class PluginSettingTab {
  app: Plugin["app"];
  plugin: Plugin;
  containerEl: HTMLElement;
  constructor(app: Plugin["app"], plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement("div");
  }
}

export class Setting {
  constructor(_containerEl: HTMLElement) {}
  setName(_name: string): this {
    return this;
  }
  setDesc(_desc: string): this {
    return this;
  }
  addToggle(cb: (toggle: { setValue: (value: boolean) => typeof toggle; onChange: (cb: (value: boolean) => unknown) => typeof toggle }) => void): this {
    const toggle = {
      setValue: (_value: boolean) => toggle,
      onChange: (_cb: (value: boolean) => unknown) => toggle
    };
    cb(toggle);
    return this;
  }
  addDropdown(cb: (dropdown: {
    addOption: (value: string, label: string) => typeof dropdown;
    setValue: (value: string) => typeof dropdown;
    onChange: (cb: (value: string) => unknown) => typeof dropdown;
  }) => void): this {
    const dropdown = {
      addOption: (_value: string, _label: string) => dropdown,
      setValue: (_value: string) => dropdown,
      onChange: (_cb: (value: string) => unknown) => dropdown
    };
    cb(dropdown);
    return this;
  }
}

export class Menu {
  hidden = false;
  addItem(cb: (item: MenuItem) => void): this {
    cb(new MenuItem());
    return this;
  }
  addSeparator(): this {
    return this;
  }
  setUseNativeMenu(_useNative: boolean): this {
    return this;
  }
  setParentElement(_el: HTMLElement): this {
    return this;
  }
  showAtMouseEvent(_event: MouseEvent): void {}
  showAtPosition(_position: { x: number; y: number }): void {}
  hide(): this {
    this.hidden = true;
    this.hideCallback?.();
    return this;
  }
  onHide(callback: () => unknown): void {
    this.hideCallback = callback;
  }
  private hideCallback?: () => unknown;
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
