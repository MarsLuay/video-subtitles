import { containedPath, readContainedFile, writeContainedFile } from "./containedFs";
import { loadFs, loadHttp, loadHttps, loadOs, loadPath, loadZlib } from "./node";

export async function downloadFile(url: string, dest: string, root: string): Promise<void> {
  const fs = loadFs();
  const path = loadPath();
  const https = loadHttps();
  const http = loadHttp();
  const file = containedPath(root, dest);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.part`;
  await new Promise<void>((resolve, reject) => {
    const follow = (target: string, hops: number): void => {
      if (hops > 8) {
        reject(new Error("download redirected too many times"));
        return;
      }
      const client = target.startsWith("http://") ? http : https;
      const req = client.get(target, { headers: { "User-Agent": "video-subtitles" } }, (res) => {
        const status = res.statusCode ?? 0;
        const next = res.headers.location;
        if (status >= 300 && status < 400 && next) {
          res.resume();
          follow(new URL(next, target).href, hops + 1);
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new Error(`download failed (${status})`));
          return;
        }
        const out = fs.createWriteStream(tmp);
        res.pipe(out);
        out.on("finish", () => {
          out.close(() => resolve());
        });
        out.on("error", reject);
      });
      req.on("error", reject);
    };
    follow(url, 0);
  });
  if (fs.existsSync(file)) fs.unlinkSync(file);
  fs.renameSync(tmp, file);
}

export function gunzipFile(src: string, dest: string, root: string): void {
  const zlib = loadZlib();
  const from = containedPath(root, src);
  const to = containedPath(root, dest);
  const bytes = zlib.gunzipSync(readContainedFile(root, from));
  writeContainedFile(root, to, bytes);
}

export function chmod755(file: string): void {
  const fs = loadFs();
  const os = loadOs();
  if (os.platform() === "win32") return;
  fs.chmodSync(file, 0o755);
}

export function removePath(target: string): void {
  loadFs().rmSync(target, { recursive: true, force: true });
}

export function existsFile(target: string): boolean {
  return loadFs().existsSync(target);
}
