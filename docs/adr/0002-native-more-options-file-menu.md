---
status: accepted
---

# Use the native More options menu

The video pane's three-dot control is `View.onPaneMenu(menu, "more-options")`, which FileView follows with `workspace.trigger("file-menu", menu, file, source, leaf)`. Plugins add rows there. A fake overlay button on Chromium's media overflow is not that API and is removed.
