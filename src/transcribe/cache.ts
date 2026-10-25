import { containedPath, readContainedFile, writeContainedFile } from "./containedFs";
import { loadFs, loadPath } from "./node";

function requestHref(request: RequestInfo | URL): string {
  if (request instanceof URL) return request.href;
  if (typeof request === "string") return request;
  return request.url;
}

function isUnsafeCachePart(part: string, sep: string): boolean {
  return (
    !part ||
    part === "." ||
    part === ".." ||
    part.includes(sep) ||
    part.includes("\0") ||
    part.startsWith("/") ||
    part.startsWith("\\") ||
    /^[A-Za-z]:/.test(part)
  );
}

export function modelCachePath(root: string, href: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const path = loadPath();
  const parts: string[] = [];
  for (const part of [parsed.host, ...parsed.pathname.split("/")]) {
    const clean = part.replace(/[<>:"|?*]/g, "_");
    if (isUnsafeCachePart(clean, path.sep)) continue;
    parts.push(clean);
  }
  if (parts.length === 0) return null;
  return path.join(root, ...parts);
}

export function fileCache(root: string): {
  match: (request: RequestInfo | URL) => Promise<Response | undefined>;
  put: (request: RequestInfo | URL, response: Response) => Promise<void>;
} {
  const fs = loadFs();
  const path = loadPath();
  return {
    async match(request) {
      const target = modelCachePath(root, requestHref(request));
      if (!target) return undefined;
      let file: string;
      try {
        file = containedPath(root, target);
      } catch {
        return undefined;
      }
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return undefined;
      const bytes = readContainedFile(root, file);
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return new Response(copy, {
        headers: { "Content-Type": "application/octet-stream" }
      });
    },
    async put(request, response) {
      const target = modelCachePath(root, requestHref(request));
      if (!target) return;
      let file: string;
      try {
        file = containedPath(root, target);
      } catch {
        return;
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      writeContainedFile(root, file, new Uint8Array(await response.arrayBuffer()));
    }
  };
}
