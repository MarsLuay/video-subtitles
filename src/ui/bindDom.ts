import type { Component } from "obsidian";

export function bindDom<K extends keyof HTMLElementEventMap>(
  owner: object,
  el: HTMLElement,
  type: K,
  callback: (this: HTMLElement, ev: HTMLElementEventMap[K]) => void
): void {
  (owner as Component).registerDomEvent(el, type, callback);
}
