import { describe, expect, it } from "vitest";
import { Menu } from "obsidian";
import { buildSubtitleMenuRows, playbackSpeedLabel } from "../src/ui/menuModel";
import { mountMenuInParent, openOverflowMenu, toggleOverflowMenu } from "../src/ui/overflowMenu";
import {
  DEBUG_SHOW_OVERFLOW_HIT,
  FALLBACK_OVERFLOW_BUTTON,
  FULLSCREEN_OVERFLOW_BUTTON,
  FULLSCREEN_OVERFLOW_RIGHT_INSET,
  OVERFLOW_BUTTON_BOTTOM_INSET,
  OVERFLOW_BUTTON_RIGHT_INSET,
  defaultFullscreenHit,
  defaultOverflowHit,
  hitControlKind,
  isOverflowButtonHit,
  measureFullscreenHit,
  measureOverflowHit,
  overlayInsets,
  overlayOffset,
  overflowControlsVisible,
  shouldStealControlClick
} from "../src/ui/overflowButton";
import {
  currentFullscreenElement,
  fullscreenMenuParent,
  isPlayerFullscreen,
  videoFullscreenRedirect
} from "../src/ui/fullscreen";

describe("player overflow 3-dot", () => {
  it("keeps the overflow hit box invisible", () => {
    expect(DEBUG_SHOW_OVERFLOW_HIT).toBe(false);
  });

  it("hits the native overflow button at the bottom-right of the control bar", () => {
    const bounds = { width: 640, height: 360, left: 10, top: 20 };
    // 48×48, right 0, bottom 24 → video-local [592,288]–[640,336], client [602,308]–[650,356]
    expect(isOverflowButtonHit(bounds, 620, 330)).toBe(true);
    expect(isOverflowButtonHit(bounds, 640, 350)).toBe(true);
    expect(isOverflowButtonHit(bounds, 651, 355)).toBe(false);
    expect(isOverflowButtonHit(bounds, 640, 370)).toBe(false);
    expect(isOverflowButtonHit(bounds, 500, 330)).toBe(false);
    expect(isOverflowButtonHit(bounds, 640, 200)).toBe(false);
  });

  it("only steals that click while Chromium controls are showing", () => {
    expect(overflowControlsVisible(true, false)).toBe(true);
    expect(overflowControlsVisible(false, true)).toBe(true);
    expect(overflowControlsVisible(false, false)).toBe(false);
    const bounds = { width: 640, height: 360, left: 10, top: 20 };
    const overflow = {
      width: FALLBACK_OVERFLOW_BUTTON,
      height: FALLBACK_OVERFLOW_BUTTON,
      right: OVERFLOW_BUTTON_RIGHT_INSET,
      bottom: OVERFLOW_BUTTON_BOTTOM_INSET
    };
    const fullscreen = {
      ...overflow,
      right: FALLBACK_OVERFLOW_BUTTON + OVERFLOW_BUTTON_RIGHT_INSET
    };
    expect(hitControlKind(bounds, 620, 330, overflow, fullscreen)).toBe("overflow");
    expect(hitControlKind(bounds, 580, 330, overflow, fullscreen)).toBe("fullscreen");
    expect(hitControlKind(bounds, 200, 200, overflow, fullscreen)).toBeNull();
    expect(shouldStealControlClick(false, true, "overflow")).toBe(true);
    expect(shouldStealControlClick(false, false, "overflow")).toBe(false);
    expect(shouldStealControlClick(false, true, "fullscreen")).toBe(true);
    expect(shouldStealControlClick(false, false, "fullscreen")).toBe(false);
  });

  it("does not treat the native fullscreen button as overflow", () => {
    const bounds = { width: 640, height: 360, left: 415, top: 90 };
    const overflow = {
      width: FALLBACK_OVERFLOW_BUTTON,
      height: FALLBACK_OVERFLOW_BUTTON,
      right: OVERFLOW_BUTTON_RIGHT_INSET,
      bottom: OVERFLOW_BUTTON_BOTTOM_INSET
    };
    const fullscreen = {
      ...overflow,
      right: FALLBACK_OVERFLOW_BUTTON + OVERFLOW_BUTTON_RIGHT_INSET
    };
    // CDP 640×360: fullscreen center 983, overflow center 1031
    expect(hitControlKind(bounds, 983, 402, overflow, fullscreen)).toBe("fullscreen");
    expect(hitControlKind(bounds, 1031, 402, overflow, fullscreen)).toBe("overflow");
  });

  it("offsets overlay buttons when the fullscreen player is larger than the video", () => {
    expect(overlayInsets({ right: 1920, bottom: 1080 }, { right: 1920, bottom: 1080 })).toEqual({
      right: 0,
      bottom: 0
    });
    expect(overlayInsets({ right: 1920, bottom: 1080 }, { right: 1600, bottom: 900 })).toEqual({
      right: 320,
      bottom: 180
    });
  });

  it("places overlay buttons from the video box so a later player shrink keeps them on the controls", () => {
    const box = {
      width: FALLBACK_OVERFLOW_BUTTON,
      height: FALLBACK_OVERFLOW_BUTTON,
      right: OVERFLOW_BUTTON_RIGHT_INSET,
      bottom: OVERFLOW_BUTTON_BOTTOM_INSET
    };
    const fullscreen = {
      ...box,
      right: FALLBACK_OVERFLOW_BUTTON + OVERFLOW_BUTTON_RIGHT_INSET
    };
    const video = { left: 415, top: 90, width: 640, height: 360 };
    const widePlayer = { left: 415, top: 90 };
    const shrunkPlayer = { left: 415, top: 90 };
    expect(overlayOffset(widePlayer, video, box)).toEqual({ left: 592, top: 288 });
    expect(overlayOffset(shrunkPlayer, video, fullscreen)).toEqual({ left: 544, top: 288 });
    expect(overlayOffset({ left: 0, top: 0 }, { left: 160, top: 90, width: 1600, height: 900 }, box)).toEqual({
      left: 1712,
      top: 918
    });
  });

  it("uses the public overflow-button pseudo size when Chromium exposes it", () => {
    const video = document.createElement("video");
    const original = window.getComputedStyle.bind(window);
    window.getComputedStyle = ((el: Element, pseudo?: string | null) => {
      if (pseudo === "::-webkit-media-controls-overflow-button") {
        return {
          width: "36px",
          height: "36px",
          marginRight: "4px",
          marginBottom: "2px",
          right: "auto",
          bottom: "auto"
        } as CSSStyleDeclaration;
      }
      if (pseudo === "::-webkit-media-controls-enclosure") {
        return { paddingRight: "5px", paddingBottom: "5px" } as CSSStyleDeclaration;
      }
      return original(el, pseudo);
    }) as typeof window.getComputedStyle;
    try {
      expect(measureOverflowHit(video)).toEqual({
        width: 36,
        height: 36,
        right: 4,
        bottom: 2
      });
    } finally {
      window.getComputedStyle = original;
    }
  });

  it("falls back to Chromium's 48px overflow button when the pseudo has no size", () => {
    const video = document.createElement("video");
    expect(defaultOverflowHit(false)).toEqual({
      width: FALLBACK_OVERFLOW_BUTTON,
      height: FALLBACK_OVERFLOW_BUTTON,
      right: OVERFLOW_BUTTON_RIGHT_INSET,
      bottom: OVERFLOW_BUTTON_BOTTOM_INSET
    });
    expect(measureOverflowHit(video)).toEqual({
      width: 48,
      height: 48,
      right: 0,
      bottom: 24
    });
    expect(measureFullscreenHit(video)).toEqual({
      width: 48,
      height: 48,
      right: 48,
      bottom: 24
    });
  });

  it("falls back to Chromium's 64px fullscreen controls while the player is fullscreen", () => {
    const video = document.createElement("video");
    const player = document.createElement("div");
    player.appendChild(video);
    Object.defineProperty(video, "ownerDocument", {
      configurable: true,
      value: { fullscreenElement: player }
    });
    const overflow = defaultOverflowHit(true);
    expect(overflow).toEqual({
      width: FULLSCREEN_OVERFLOW_BUTTON,
      height: FULLSCREEN_OVERFLOW_BUTTON,
      right: FULLSCREEN_OVERFLOW_RIGHT_INSET,
      bottom: OVERFLOW_BUTTON_BOTTOM_INSET
    });
    expect(defaultFullscreenHit(overflow)).toEqual({
      width: 64,
      height: 64,
      right: 80,
      bottom: 24
    });
    expect(measureOverflowHit(video)).toEqual(overflow);
    expect(measureFullscreenHit(video)).toEqual(defaultFullscreenHit(overflow));
  });

  it("hits the native fullscreen button while Chromium uses 64px fullscreen controls", () => {
    const bounds = { width: 1470, height: 923, left: 0, top: 0 };
    const overflow = defaultOverflowHit(true);
    const fullscreen = defaultFullscreenHit(overflow);
    // CDP fullscreen 1470×923: fullscreen 1326×835 64×64 (center 1358,867); overflow 1390×835
    expect(hitControlKind(bounds, 1358, 867, overflow, fullscreen)).toBe("fullscreen");
    expect(hitControlKind(bounds, 1422, 867, overflow, fullscreen)).toBe("overflow");
    expect(hitControlKind(bounds, 1294, 867, overflow, fullscreen)).toBeNull();
    expect(overlayOffset({ left: 0, top: 0 }, { left: 0, top: 0, width: 1470, height: 923 }, overflow)).toEqual({
      left: 1390,
      top: 835
    });
    expect(overlayOffset({ left: 0, top: 0 }, { left: 0, top: 0, width: 1470, height: 923 }, fullscreen)).toEqual({
      left: 1326,
      top: 835
    });
  });

  it("ignores overflow-button styles that copy the video host box", () => {
    const video = document.createElement("video");
    Object.defineProperty(video, "clientWidth", { configurable: true, value: 960 });
    Object.defineProperty(video, "clientHeight", { configurable: true, value: 540 });
    const original = window.getComputedStyle.bind(window);
    window.getComputedStyle = ((el: Element, pseudo?: string | null) => {
      if (
        pseudo === "::-webkit-media-controls-overflow-button" ||
        pseudo === "::-internal-media-controls-overflow-button"
      ) {
        return { width: "960px", height: "540px", marginRight: "0px", marginBottom: "0px", right: "auto", bottom: "auto" } as CSSStyleDeclaration;
      }
      return original(el, pseudo);
    }) as typeof window.getComputedStyle;
    try {
      expect(measureOverflowHit(video)).toEqual({
        width: 48,
        height: 48,
        right: 0,
        bottom: 24
      });
    } finally {
      window.getComputedStyle = original;
    }
  });
});

describe("buildSubtitleMenuRows", () => {
  it("starts with Download, Playback speed, and Picture in picture", () => {
    const rows = buildSubtitleMenuRows({
      tracks: [],
      activeTrackId: null
    });
    expect(rows.map((row) => row.kind).slice(0, 4)).toEqual([
      "download",
      "playback-speed",
      "pip",
      "separator"
    ]);
    expect(playbackSpeedLabel(1)).toBe("Normal");
    expect(playbackSpeedLabel(1.5)).toBe("1.5×");
  });

  it("shows Off, Create, and Import when no tracks are loaded", () => {
    const rows = buildSubtitleMenuRows({
      tracks: [],
      activeTrackId: null
    });
    expect(rows.find((row) => row.kind === "off")).toEqual({ kind: "off", checked: true });
    expect(rows.map((row) => row.kind).slice(-2)).toEqual(["create", "import"]);
    expect(rows.filter((row) => row.kind === "track")).toHaveLength(0);
  });

  it("lists an imported track after Off and before Create and Import", () => {
    const rows = buildSubtitleMenuRows({
      tracks: [{ id: "sub-1", label: "lecture" }],
      activeTrackId: "sub-1"
    });
    expect(rows.map((row) => row.kind)).toEqual([
      "download",
      "playback-speed",
      "pip",
      "separator",
      "off",
      "track",
      "create",
      "import"
    ]);
    expect(rows[4]).toEqual({ kind: "off", checked: false });
    expect(rows[5]).toEqual({ kind: "track", id: "sub-1", label: "lecture", checked: true });
  });
});

describe("player fullscreen", () => {
  it("parents the overflow menu to the player only while that player is fullscreen", () => {
    const player = document.createElement("div");
    const other = document.createElement("video");
    const doc = { fullscreenElement: null } as unknown as Document;
    expect(currentFullscreenElement(doc)).toBeNull();
    expect(fullscreenMenuParent(doc, player)).toBeUndefined();
    (doc as { fullscreenElement: Element | null }).fullscreenElement = player;
    expect(isPlayerFullscreen(doc, player)).toBe(true);
    expect(fullscreenMenuParent(doc, player)).toBe(player);
    (doc as { fullscreenElement: Element | null }).fullscreenElement = other;
    expect(isPlayerFullscreen(doc, player)).toBe(false);
    expect(fullscreenMenuParent(doc, player)).toBeUndefined();
  });

  it("treats another native fullscreen request as exit while the player is fullscreen", () => {
    expect(videoFullscreenRedirect(false)).toBe("enter");
    expect(videoFullscreenRedirect(true)).toBe("exit");
  });
});

describe("mountMenuInParent", () => {
  it("moves a body menu into the fullscreen player", () => {
    const player = document.createElement("div");
    const menu = document.createElement("div");
    menu.className = "menu";
    document.body.append(player, menu);
    mountMenuInParent(player);
    expect(menu.parentElement).toBe(player);
    player.remove();
    menu.remove();
  });
});

describe("toggleOverflowMenu", () => {
  it("hides the open menu instead of opening another", () => {
    const open = new Menu();
    expect(toggleOverflowMenu(open, dummyMenuOptions())).toBeNull();
    expect((open as Menu & { hidden: boolean }).hidden).toBe(true);
  });
});

describe("openOverflowMenu", () => {
  it("does not setParentElement on the fullscreen player", () => {
    const player = document.createElement("div");
    document.body.append(player);
    const menu = openOverflowMenu({ ...dummyMenuOptions(), parent: player });
    expect((menu as Menu & { parentEl: HTMLElement | null }).parentEl).toBeNull();
    player.remove();
  });
});

function dummyMenuOptions(): Parameters<typeof toggleOverflowMenu>[1] {
  const event = new MouseEvent("click", { clientX: 10, clientY: 10 });
  Object.defineProperty(event, "target", { value: document.body });
  return {
    event,
    tracks: [],
    activeTrackId: null,
    playbackRate: 1,
    onDownload: () => undefined,
    onRate: () => undefined,
    onPip: () => undefined,
    onOff: () => undefined,
    onSelectTrack: () => undefined,
    onCreate: () => undefined,
    onImport: () => undefined
  };
}
