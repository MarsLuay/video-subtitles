---
status: accepted
---

# Use the player overflow 3-dot

Download, Playback speed, and Picture in picture live on Chromium's `::-webkit-media-controls-overflow-button`, not the pane header More options menu. That overflow list is closed-shadow and has no add-item API (`controlsList` can only hide entries). The plugin keeps that native 3-dot, turns off pointer events on the pseudo-element, and opens the same list plus Off / tracks / Import from a click in that button's control-bar slot.
