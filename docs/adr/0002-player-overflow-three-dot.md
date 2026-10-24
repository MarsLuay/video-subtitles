---
status: accepted
---

# Use the player overflow 3-dot

Download, Playback speed, and Picture in Picture live on Chromium's `-internal-media-controls-overflow-button`. That list is closed-shadow; author CSS/JS cannot append rows. Clicks on that control never reach page listeners. The plugin shrink-wraps the `<video>` and puts a transparent hit target on that native 3-dot so the same click opens Download / Playback speed / Picture in Picture plus Off / tracks / Import.
