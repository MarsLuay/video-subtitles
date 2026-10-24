# Video Subtitles

Import a subtitle file from the video player's overflow 3-dot and keep that track inside the video file.

## Language

**More options**:
The native player 3-dot (`::-webkit-media-controls-overflow-button`) that already holds Download, Playback speed, and Picture in picture.
_Avoid_: pane header more-options, fake overlay icon, kebab

**Off**:
The menu row that hides captions without deleting the stored track.
_Avoid_: disable, none, hide

**Create**:
The menu action above Import that transcribes the open video and upserts an embedded track named `generated`.
_Avoid_: generate captions, transcribe menu, AI subtitles

**Import**:
The menu action that picks an SRT or VTT file and adds it as a track.
_Avoid_: open, attach sidecar, load captions

**Track**:
One named subtitle cue list shown in more options after import or restore.
_Avoid_: language, CC, text track API

**Absorb**:
Writing the track into the video file itself so a later open restores the menu without a sidecar.
_Avoid_: mux, burn-in, sidecar. Create may download a managed ffmpeg binary to extract audio; it does not mux captions.
