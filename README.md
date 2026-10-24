# Video Subtitles

Obsidian plugin. While a vault video is playing, the player **more options** control (three dots) opens a subtitle menu.

## What it does

1. Open a video in Obsidian (tab or embed).
2. Click **more options**.
3. Choose **Off** or **Import**.
4. Import an `.srt` or `.vtt` file.
5. Open **more options** again: the imported name is listed. Select it to show captions on the video.
6. The plugin writes that track into the video file. Reopening the video restores the menu without a sidecar.

**Off** hides captions. It does not delete the stored track.

Playback speed and picture-in-picture stay on the same more-options menu so replacing the native overflow does not drop those actions.

## Setup

```bash
cd ".Projects/video-subtitles"
npm install
npm test
npm run build
```

The build copies `main.js`, `manifest.json`, and `styles.css` to:

`.obsidian/plugins/video-subtitles/`

Enable **Video Subtitles** in **Settings → Community plugins**, then reload Obsidian.

## Notes

- Works with Obsidian video files: `mp4`, `webm`, `ogv`, `mov`, `mkv`.
- Captions overlay in Obsidian. Other apps will not show this stored track.
- No network. No ffmpeg.
- Disable the plugin to return to the native player.

## License

MIT
