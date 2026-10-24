# Video Subtitles

Obsidian plugin. While a vault video is playing, the player **more options** control (three dots next to Download / Playback speed / Picture in picture) includes subtitle rows.

## What it does

1. Open a video in Obsidian.
2. Click the player **more options** 3-dot (same menu as Download, Playback speed, Picture in picture).
3. Choose **Off**, **Create**, or **Import**.
4. **Create** transcribes the open video on desktop and stores an embedded **generated** track. **Import** picks an `.srt` or `.vtt` file.
5. Open **more options** again: the track name is listed. Select it to show captions on the video.
6. The plugin writes that track into the video file. Reopening the video restores the menu without a sidecar.

**Off** hides captions. It does not delete the stored track.

**Settings → Video Subtitles** keeps the downloaded transcriber by default so Create does not fetch it every time. You can change Whisper accuracy, language, translate to English, word timestamps, and diarization. The first desktop start picks an accuracy from this computer.

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
- **Create** downloads a local transcriber (Whisper + optional ffmpeg) into the plugin folder, then deletes it after use unless **Keep transcriber** is on. An interrupted Create on the same video resumes from the last finished window unless the file or transcriber settings changed.
- Disable the plugin to return to the native player.

## License

MIT
