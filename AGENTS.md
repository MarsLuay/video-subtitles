# Video Subtitles

Obsidian plugin. Adds Subtitles to the video player's more-options menu, creates or imports SRT/VTT, overlays cues, and stores the track inside the video file.

- Keep `main.ts` as lifecycle only.
- Subtitle rows belong on the player overflow 3-dot. Chromium's overflow list is closed-shadow, so steal that click with an invisible hit target. `DEBUG_SHOW_OVERFLOW_HIT` paints the box for testing only. Do not use the pane header `file-menu`.
- Subtitle bytes live in the video file. No sidecar.
- Native video playback remains the fallback if the plugin is disabled or unload runs.
- Run `npm test` and `npm run build` before done.
- Work on `main`. Do not add BRAT or extra scan workflows unless a concrete install path needs them.
