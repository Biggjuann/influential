import "server-only";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { nanoid } from "nanoid";

const ROOT = process.env.STORAGE_DIR ?? "./data/assets";

export async function downloadToDisk(url: string, ext: string, subdir = "misc") {
  const dir = join(ROOT, subdir);
  await mkdir(dir, { recursive: true });
  const id = nanoid(12);
  const path = join(dir, `${id}.${ext}`);

  let buf: Buffer;
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    const meta = url.slice(5, comma);
    const payload = url.slice(comma + 1);
    buf = meta.includes(";base64")
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");
  } else if (url.startsWith("file://")) {
    buf = await readFile(fileURLToPath(url));
  } else {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
    buf = Buffer.from(await res.arrayBuffer());
  }

  await writeFile(path, buf);
  return { id, path, publicUrl: `/api/assets/${subdir}/${id}.${ext}` };
}

export function publicAssetPath(subdir: string, filename: string) {
  return join(ROOT, subdir, filename);
}
