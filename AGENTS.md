# Video Subtitles

Obsidian plugin. Adds Subtitles to the video player's more-options menu, imports SRT/VTT, overlays cues, and stores the track inside the video file.

- Keep `main.ts` as lifecycle only.
- Subtitle rows belong on the native player overflow 3-dot (`::-webkit-media-controls-overflow-button`) that already holds Download, Playback speed, and Picture in picture. Do not use the pane header `file-menu`. Do not add a second 3-dot.
- Subtitle bytes live in the video file. No sidecar.
- Native video playback remains the fallback if the plugin is disabled or unload runs.
- Run `npm test` and `npm run build` before done.
- Work on `main`. Do not add BRAT or extra scan workflows unless a concrete install path needs them.
