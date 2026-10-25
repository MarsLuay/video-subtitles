import { chmod755, downloadFile, existsFile, gunzipFile, removePath } from "./download";
import { loadChildProcess, loadOs, loadPath } from "./node";

export const FFMPEG_RELEASE = "b6.1.1";

export function ffmpegAsset(
  platform: string,
  arch: string
): { url: string; archive: string; binary: string } | null {
  const archive =
    platform === "darwin" && arch === "arm64"
      ? "ffmpeg-darwin-arm64.gz"
      : platform === "darwin" && (arch === "x64" || arch === "ia32")
        ? "ffmpeg-darwin-x64.gz"
        : platform === "linux" && arch === "arm64"
          ? "ffmpeg-linux-arm64.gz"
          : platform === "linux" && (arch === "x64" || arch === "ia32")
            ? "ffmpeg-linux-x64.gz"
            : platform === "win32"
              ? "ffmpeg-win32-x64.gz"
              : null;
  if (!archive) return null;
  return {
    url: `https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_RELEASE}/${archive}`,
    archive,
    binary: platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
  };
}

export async function ensureFfmpeg(binDir: string, platform = "", arch = ""): Promise<string> {
  const os = loadOs();
  const path = loadPath();
  const asset = ffmpegAsset(platform || os.platform(), arch || os.arch());
  if (!asset) throw new Error("No ffmpeg build for this computer");
  const binary = path.join(binDir, asset.binary);
  if (existsFile(binary)) return binary;
  const archive = path.join(binDir, asset.archive);
  await downloadFile(asset.url, archive, binDir);
  gunzipFile(archive, binary, binDir);
  removePath(archive);
  chmod755(binary);
  return binary;
}

export async function extractWav(ffmpeg: string, videoPath: string, wavPath: string): Promise<void> {
  const child = loadChildProcess();
  await new Promise<void>((resolve, reject) => {
    const proc = child.spawn(
      ffmpeg,
      ["-y", "-i", videoPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-f", "wav", wavPath],
      { windowsHide: true }
    );
    let stderr = "";
    proc.stderr?.on("data", (chunk: Uint8Array | string) => {
      stderr += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().split("\n").at(-1) || "ffmpeg failed"));
    });
  });
}
