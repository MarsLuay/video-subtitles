---
status: accepted
---

# Absorb subtitle tracks inside the video file

Native Chromium overflow cannot take plugin items, and requiring ffmpeg would fail closed on most vault machines. The plugin overlays more-options, parses SRT/VTT itself, and writes tracks into the video bytes: an ISO-BMFF `uuid` box for MP4/MOV, or a trailing `VSBT` footer for other containers. Other players will not render this store; Obsidian playback stays on the original video samples. A sidecar `.srt` was rejected because the video would not hold the track.
