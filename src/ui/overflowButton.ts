/** Chromium overflow button default. Closed shadow; used if the public pseudo has no size. */
export const FALLBACK_OVERFLOW_BUTTON = 48;

/** Paint the overflow hit target. Testing only. */
export const DEBUG_SHOW_OVERFLOW_HIT = true;

const OVERFLOW_PSEUDOS = [
  "::-webkit-media-controls-overflow-button",
  "::-internal-media-controls-overflow-button"
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
  size: Pick<OverflowHitBox, "width" | "height"> = {
    width: FALLBACK_OVERFLOW_BUTTON,
    height: FALLBACK_OVERFLOW_BUTTON
  }
): boolean {
  const x = clientX - bounds.left;
  const y = clientY - bounds.top;
  return (
    x >= bounds.width - size.width &&
    x <= bounds.width &&
    y >= bounds.height - size.height &&
    y <= bounds.height
  );
}

export function measureOverflowHit(video: HTMLVideoElement): OverflowHitBox {
  const win = viewOf(video);
  if (!win) {
    return {
      width: FALLBACK_OVERFLOW_BUTTON,
      height: FALLBACK_OVERFLOW_BUTTON,
      right: 0,
      bottom: 0
    };
  }

  const overflow = firstOverflowStyle(win, video);
  const enclosure = win.getComputedStyle(video, "::-webkit-media-controls-enclosure");
  const panel = win.getComputedStyle(video, "::-webkit-media-controls-panel");
  const width =
    px(overflow?.width) || FALLBACK_OVERFLOW_BUTTON;
  const height =
    px(overflow?.height) || FALLBACK_OVERFLOW_BUTTON;
  const right =
    px(overflow?.marginRight) ||
    px(overflow?.right) ||
    px(enclosure.paddingRight) ||
    px(panel.paddingRight);
  const bottom =
    px(overflow?.marginBottom) ||
    px(overflow?.bottom) ||
    px(enclosure.paddingBottom) ||
    px(panel.paddingBottom);

  return { width, height, right, bottom };
}

function viewOf(video: HTMLVideoElement): Window | null {
  const withWin = video as HTMLVideoElement & { win?: Window };
  return withWin.win ?? video.ownerDocument.defaultView;
}

function firstOverflowStyle(win: Window, video: HTMLVideoElement): CSSStyleDeclaration | null {
  for (const pseudo of OVERFLOW_PSEUDOS) {
    const style = win.getComputedStyle(video, pseudo);
    if (px(style.width) > 0 && px(style.height) > 0) return style;
  }
  return null;
}

function px(value: string | undefined): number {
  if (!value || value === "auto") return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
