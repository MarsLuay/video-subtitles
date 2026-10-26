export function currentFullscreenElement(doc: Document): Element | null {
  return (
    doc.fullscreenElement ??
    (doc as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement ??
    null
  );
}

export function isPlayerFullscreen(doc: Document, player: HTMLElement): boolean {
  return currentFullscreenElement(doc) === player;
}

export function fullscreenMenuParent(doc: Document, player: HTMLElement): HTMLElement | undefined {
  return isPlayerFullscreen(doc, player) ? player : undefined;
}

export async function requestFullscreen(el: HTMLElement): Promise<void> {
  if (typeof el.requestFullscreen === "function") {
    await el.requestFullscreen();
    return;
  }
  const prefixed = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
  await prefixed.webkitRequestFullscreen?.();
}

/** Native FS control still "enters" while the wrapper is fullscreen; treat that as exit. */
export function videoFullscreenRedirect(
  playerIsFullscreen: boolean
): "exit" | "enter" {
  return playerIsFullscreen ? "exit" : "enter";
}

export async function exitFullscreen(doc: Document): Promise<void> {
  if (!currentFullscreenElement(doc)) return;
  if (typeof doc.exitFullscreen === "function") {
    await doc.exitFullscreen();
    return;
  }
  const prefixed = doc as Document & { webkitExitFullscreen?: () => Promise<void> | void };
  await prefixed.webkitExitFullscreen?.();
}
