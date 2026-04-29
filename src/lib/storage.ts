import "server-only";
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Storage layer: S3-compatible object store (Cloudflare R2, AWS S3, Backblaze, etc)
// for production, with a local filesystem fallback for `npm run dev` without
// any S3 credentials. Returned URLs are publicly fetchable so fal.ai can pull
// reference assets back during multi-step pipelines.

const S3_BUCKET = process.env.S3_BUCKET;
const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL?.replace(/\/$/, "");
const useS3 = !!S3_BUCKET && !!S3_PUBLIC_URL;

const s3 = useS3
  ? new S3Client({
      endpoint: process.env.S3_ENDPOINT, // omit for AWS S3, set for R2/etc
      region: process.env.S3_REGION ?? "auto",
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "1",
    })
  : null;

const FS_ROOT = process.env.STORAGE_DIR ?? "./data/assets";

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
};

function contentTypeFor(ext: string) {
  return MIME[ext.toLowerCase()] ?? "application/octet-stream";
}

async function readSourceUrl(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    const meta = url.slice(5, comma);
    const payload = url.slice(comma + 1);
    return meta.includes(";base64")
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");
  }
  if (url.startsWith("file://")) return readFile(fileURLToPath(url));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function writeBuffer(key: string, body: Buffer, contentType: string): Promise<string> {
  if (useS3 && s3) {
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return `${S3_PUBLIC_URL}/${key}`;
  }
  // FS fallback
  const path = join(FS_ROOT, key);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, body);
  return `/api/assets/${key}`;
}

/** Persist a remote URL (or data:/file:) into storage and return its public URL. */
export async function persistFromUrl(
  url: string,
  opts: { key: string; ext: string },
): Promise<{ url: string; key: string }> {
  const buf = await readSourceUrl(url);
  const finalUrl = await writeBuffer(opts.key, buf, contentTypeFor(opts.ext));
  return { url: finalUrl, key: opts.key };
}

/** Persist a local file path (e.g. ffmpeg output) into storage. */
export async function persistFromFile(
  path: string,
  opts: { key: string; ext: string },
): Promise<{ url: string; key: string }> {
  const buf = await readFile(path);
  const finalUrl = await writeBuffer(opts.key, buf, contentTypeFor(opts.ext));
  return { url: finalUrl, key: opts.key };
}

/** Read a file from FS-mode storage (used by /api/assets fallback route). */
export async function readFromFsKey(key: string) {
  const path = join(FS_ROOT, key);
  const info = await stat(path);
  return { path, size: info.size };
}

export const storageMode = useS3 ? "s3" : "fs";
