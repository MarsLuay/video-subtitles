# Video Subtitles

Import a subtitle file from the video more-options menu and keep that track inside the video file.

## Language

**More options**:
The pane three-dot control that opens `onPaneMenu` / `file-menu` with source `more-options`.
_Avoid_: overlay button, Chromium overflow, kebab

**Off**:
The menu row that hides captions without deleting the stored track.
_Avoid_: disable, none, hide

**Import**:
The menu action that picks an SRT or VTT file and adds it as a track.
_Avoid_: open, attach sidecar, load captions

**Track**:
One named subtitle cue list shown in more options after import or restore.
_Avoid_: language, CC, text track API

**Absorb**:
Writing the track into the video file itself so a later open restores the menu without a sidecar.
_Avoid_: mux, burn-in, ffmpeg, sidecar
