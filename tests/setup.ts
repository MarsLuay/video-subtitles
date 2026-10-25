Object.defineProperty(HTMLElement.prototype, "instanceOf", {
  configurable: true,
  value(this: HTMLElement, type: new (...args: never[]) => unknown) {
    return this instanceof type;
  }
});

Object.defineProperty(HTMLElement.prototype, "setCssProps", {
  configurable: true,
  value(this: HTMLElement, props: Record<string, string>) {
    for (const [key, value] of Object.entries(props)) this.style.setProperty(key, value);
  }
});

Object.defineProperty(HTMLElement.prototype, "empty", {
  configurable: true,
  value(this: HTMLElement) {
    this.replaceChildren();
  }
});

Object.defineProperty(HTMLElement.prototype, "addClass", {
  configurable: true,
  value(this: HTMLElement, cls: string) {
    this.classList.add(cls);
  }
});

Object.defineProperty(HTMLElement.prototype, "toggleClass", {
  configurable: true,
  value(this: HTMLElement, cls: string, on: boolean) {
    this.classList.toggle(cls, on);
  }
});

Object.defineProperty(HTMLElement.prototype, "createDiv", {
  configurable: true,
  value(this: HTMLElement, opts?: string | { cls?: string; text?: string }) {
    const el = document.createElement("div");
    if (typeof opts === "string") el.className = opts;
    else if (opts) {
      if (opts.cls) el.className = opts.cls;
      if (opts.text) el.textContent = opts.text;
    }
    this.appendChild(el);
    return el;
  }
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false
  })
});
