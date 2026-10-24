/** Chromium overflow button sits at the trailing end of the control bar. */
export const OVERFLOW_BUTTON_WIDTH = 48;
export const OVERFLOW_BAR_HEIGHT = 52;

export function overflowControlsVisible(paused: boolean, hovering: boolean): boolean {
  return paused || hovering;
}

export function isOverflowButtonHit(
  bounds: { width: number; height: number; left: number; top: number },
  clientX: number,
  clientY: number
): boolean {
  const x = clientX - bounds.left;
  const y = clientY - bounds.top;
  return (
    x >= bounds.width - OVERFLOW_BUTTON_WIDTH &&
    x <= bounds.width &&
    y >= bounds.height - OVERFLOW_BAR_HEIGHT &&
    y <= bounds.height
  );
}
