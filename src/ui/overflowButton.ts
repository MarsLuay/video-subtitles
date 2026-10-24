/** Chromium overflow button. Closed shadow; public ::-webkit-media-controls-overflow-button copies the video box. */
export const FALLBACK_OVERFLOW_BUTTON = 48;

/**
 * Gap under the overlay overflow button (timeline row). CDP at 960×540 and 640×360: always 24px.
 */
export const OVERFLOW_BUTTON_BOTTOM_INSET = 24;

/** Paint the overflow hit target. Testing only. */
export const DEBUG_SHOW_OVERFLOW_HIT = false;

const OVERFLOW_PSEUDOS = [
  "::-webkit-media-controls-overflow-button",
  "::-internal-media-controls-overflow-button"
] as const;

const FULLSCREEN_PSEUDOS = [
  "::-webkit-media-controls-fullscreen-button",
  "::-internal-media-controls-fullscreen-button"
] as const;

export type OverflowHitBox = {
  width: number;
  height: number;
  right: number;
  bottom: number;
};

export function overflowControlsVisible(paused: boolean, hovering: boolean): boolean {
  return paused || hovering;
}

export function isOverflowButtonHit(
  bounds: { width: number; height: number; left: number; top: number },
  clientX: number,
  clientY: number,
  size: OverflowHitBox = {
    width: FALLBACK_OVERFLOW_BUTTON,
    height: FALLBACK_OVERFLOW_BUTTON,
    right: 0,
    bottom: OVERFLOW_BUTTON_BOTTOM_INSET
  }
): boolean {
  const x = clientX - bounds.left;
  const y = clientY - bounds.top;
  const left = bounds.width - size.width - size.right;
  const right = bounds.width - size.right;
  const top = bounds.height - size.height - size.bottom;
  const bottom = bounds.height - size.bottom;
  return x >= left && x <= right && y >= top && y <= bottom;
}

export function hitControlKind(
  bounds: { width: number; height: number; left: number; top: number },
  clientX: number,
  clientY: number,
  overflow: OverflowHitBox,
  fullscreen: OverflowHitBox
): "overflow" | "fullscreen" | null {
  if (isOverflowButtonHit(bounds, clientX, clientY, overflow)) return "overflow";
  if (isOverflowButtonHit(bounds, clientX, clientY, fullscreen)) return "fullscreen";
  return null;
}

export function shouldStealControlClick(
  paused: boolean,
  hovering: boolean,
  kind: "overflow" | "fullscreen" | null
): boolean {
  return kind !== null && overflowControlsVisible(paused, hovering);
}

export function measureOverflowHit(video: HTMLVideoElement): OverflowHitBox {
  const fallback: OverflowHitBox = {
    width: FALLBACK_OVERFLOW_BUTTON,
    height: FALLBACK_OVERFLOW_BUTTON,
    right: 0,
    bottom: OVERFLOW_BUTTON_BOTTOM_INSET
  };
  const win = viewOf(video);
  if (!win) return fallback;

  const overflow = firstControlStyle(win, video, OVERFLOW_PSEUDOS);
  if (!overflow) return fallback;

  const enclosure = win.getComputedStyle(video, "::-webkit-media-controls-enclosure");
  const panel = win.getComputedStyle(video, "::-webkit-media-controls-panel");
  return {
    width: px(overflow.width) || fallback.width,
    height: px(overflow.height) || fallback.height,
    right:
      px(overflow.marginRight) ||
      px(overflow.right) ||
      px(enclosure.paddingRight) ||
      px(panel.paddingRight),
    bottom:
      px(overflow.marginBottom) ||
      px(overflow.bottom) ||
      px(enclosure.paddingBottom) ||
      px(panel.paddingBottom) ||
      fallback.bottom
  };
}

function viewOf(video: HTMLVideoElement): Window | null {
  const withWin = video as HTMLVideoElement & { win?: Window };
  return withWin.win ?? video.ownerDocument.defaultView;
}

export function measureFullscreenHit(video: HTMLVideoElement): OverflowHitBox {
  const overflow = measureOverflowHit(video);
  const fallback: OverflowHitBox = {
    width: overflow.width,
    height: overflow.height,
    right: overflow.width + overflow.right,
    bottom: overflow.bottom
  };
  const win = viewOf(video);
  if (!win) return fallback;
  const fullscreen = firstControlStyle(win, video, FULLSCREEN_PSEUDOS);
  if (!fullscreen) return fallback;
  return {
    width: px(fullscreen.width) || fallback.width,
    height: px(fullscreen.height) || fallback.height,
    right: px(fullscreen.marginRight) || px(fullscreen.right) || fallback.right,
    bottom:
      px(fullscreen.marginBottom) ||
      px(fullscreen.bottom) ||
      fallback.bottom
  };
}

function firstControlStyle(
  win: Window,
  video: HTMLVideoElement,
  pseudos: readonly string[]
): CSSStyleDeclaration | null {
  for (const pseudo of pseudos) {
    const style = win.getComputedStyle(video, pseudo);
    const width = px(style.width);
    const height = px(style.height);
    if (width > 0 && height > 0 && !isHostSized(video, width, height)) return style;
  }
  return null;
}

/** Closed-shadow overflow-button computed style is the video box, not the 48px control. */
function isHostSized(video: HTMLVideoElement, width: number, height: number): boolean {
  const host = video.getBoundingClientRect();
  const hostWidth = video.clientWidth || host.width;
  const hostHeight = video.clientHeight || host.height;
  if (hostWidth <= 0 || hostHeight <= 0) return false;
  return width >= hostWidth - 1 && height >= hostHeight - 1;
}

function px(value: string | undefined): number {
  if (!value || value === "auto") return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
