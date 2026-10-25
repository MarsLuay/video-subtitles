import { loadFs, loadPath } from "./node";

export function containedPath(root: string, target: string): string {
  const path = loadPath();
  const file = path.resolve(target);
  const base = path.resolve(root);
  const prefix = base.endsWith(path.sep) ? base : `${base}${path.sep}`;
  if (!file.startsWith(base) || (file !== base && !file.startsWith(prefix))) {
    throw new Error("path escapes root");
  }
  return file;
}

export function readContainedFile(root: string, target: string): Uint8Array {
  const fs = loadFs();
  return new Uint8Array(fs.readFileSync(containedPath(root, target)));
}

export function writeContainedFile(root: string, target: string, data: string | Uint8Array): void {
  const fs = loadFs();
  fs.writeFileSync(containedPath(root, target), data);
}
