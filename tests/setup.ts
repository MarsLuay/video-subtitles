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
