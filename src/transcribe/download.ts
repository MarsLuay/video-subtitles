import { nodeRequire } from "./node";

export async function downloadFile(url: string, dest: string): Promise<void> {
  const fs = nodeRequire<typeof import("fs")>("fs");
  const path = nodeRequire<typeof import("path")>("path");
  const https = nodeRequire<typeof import("https")>("https");
  const http = nodeRequire<typeof import("http")>("http");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
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
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  fs.renameSync(tmp, dest);
}

export function gunzipFile(src: string, dest: string): void {
  const fs = nodeRequire<typeof import("fs")>("fs");
  const zlib = nodeRequire<typeof import("zlib")>("zlib");
  const bytes = zlib.gunzipSync(fs.readFileSync(src));
  fs.writeFileSync(dest, bytes);
}

export function chmod755(file: string): void {
  const fs = nodeRequire<typeof import("fs")>("fs");
  const os = nodeRequire<typeof import("os")>("os");
  if (os.platform() === "win32") return;
  fs.chmodSync(file, 0o755);
}

export function removePath(target: string): void {
  const fs = nodeRequire<typeof import("fs")>("fs");
  fs.rmSync(target, { recursive: true, force: true });
}

export function existsFile(target: string): boolean {
  const fs = nodeRequire<typeof import("fs")>("fs");
  return fs.existsSync(target);
}
