import { nodeRequire } from "./node";

export function fileCache(root: string): {
  match: (request: RequestInfo | URL) => Promise<Response | undefined>;
  put: (request: RequestInfo | URL, response: Response) => Promise<void>;
} {
  const fs = nodeRequire<typeof import("fs")>("fs");
  const path = nodeRequire<typeof import("path")>("path");
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
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return undefined;
      const bytes = fs.readFileSync(file);
      return new Response(bytes, {
        headers: { "Content-Type": "application/octet-stream" }
      });
    },
    async put(request, response) {
      const file = toPath(request);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, new Uint8Array(await response.arrayBuffer()));
    }
  };
}
