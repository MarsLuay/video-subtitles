import { readContainedFile, writeContainedFile } from "./containedFs";
import { loadFs, loadPath } from "./node";

export function fileCache(root: string): {
  match: (request: RequestInfo | URL) => Promise<Response | undefined>;
  put: (request: RequestInfo | URL, response: Response) => Promise<void>;
} {
  const fs = loadFs();
  const path = loadPath();
  const toPath = (request: RequestInfo | URL): string => {
    const href = request instanceof URL
      ? request.href
      : typeof request === "string"
        ? request
        : request.url;
    const parsed = new URL(href);
    const parts = [parsed.host, ...parsed.pathname.split("/").filter(Boolean)].map((part) =>
      part.replace(/[<>:"|?*]/g, "_")
    );
    return path.join(root, ...parts);
  };
  return {
    async match(request) {
      const file = toPath(request);
      if (!file.startsWith(root)) return undefined;
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return undefined;
      const bytes = readContainedFile(root, file);
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return new Response(copy, {
        headers: { "Content-Type": "application/octet-stream" }
      });
    },
    async put(request, response) {
      const file = toPath(request);
      if (!file.startsWith(root)) throw new Error("path escapes root");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      writeContainedFile(root, file, new Uint8Array(await response.arrayBuffer()));
    }
  };
}
