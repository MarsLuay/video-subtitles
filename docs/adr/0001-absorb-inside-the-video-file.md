---
status: accepted
---

# Absorb subtitle tracks inside the video file

Chromium's overflow list is closed-shadow, and requiring ffmpeg would fail closed on most vault machines. The plugin fills that same player 3-dot, parses SRT/VTT itself, and writes tracks into the video bytes: an ISO-BMFF `uuid` box for MP4/MOV, or a trailing `VSBT` footer for other containers. Other players will not render this store; Obsidian playback stays on the original video samples. A sidecar `.srt` was rejected because the video would not hold the track.
