import "server-only";
import { mkdir, writeFile, readFile, stat, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Readable } from "node:stream";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Storage layer: S3-compatible object store (Cloudflare R2, AWS S3, Backblaze, etc)
// for production, with a local filesystem fallback for `npm run dev` without
// any S3 credentials.
//
// All asset URLs returned from this layer are relative paths under
// /api/assets/<key>, served by the corresponding API route in this app. This
// means:
//   - The bucket does NOT need to be publicly accessible — we read from it
//     server-side using credentials and proxy the bytes to whoever asks.
//   - fal.ai (or any external service) fetches via Railway's public domain,
//     which is always reachable, so there's no class of "is the bucket public"
//     misconfiguration to debug.
//   - Switching between R2 and FS is invisible to callers.

const S3_BUCKET = process.env.S3_BUCKET;
const useS3 = !!S3_BUCKET;

const s3 = useS3
  ? new S3Client({
      endpoint: process.env.S3_ENDPOINT,
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

async function writeBuffer(key: string, body: Buffer, contentType: string): Promise<void> {
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
    return;
  }
  const path = join(FS_ROOT, key);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, body);
}

function publicUrlFor(key: string) {
  return `/api/assets/${key}`;
}

/** Persist a remote URL (or data:/file:) into storage and return its public URL. */
export async function persistFromUrl(
  url: string,
  opts: { key: string; ext: string },
): Promise<{ url: string; key: string }> {
  const buf = await readSourceUrl(url);
  await writeBuffer(opts.key, buf, contentTypeFor(opts.ext));
  return { url: publicUrlFor(opts.key), key: opts.key };
}

/** Persist a local file path (e.g. ffmpeg output) into storage. */
export async function persistFromFile(
  path: string,
  opts: { key: string; ext: string },
): Promise<{ url: string; key: string }> {
  const buf = await readFile(path);
  await writeBuffer(opts.key, buf, contentTypeFor(opts.ext));
  return { url: publicUrlFor(opts.key), key: opts.key };
}

/** Read an asset for the /api/assets proxy route, regardless of backend. */
export async function readAssetStream(key: string): Promise<{
  stream: ReadableStream;
  size?: number;
  contentType: string;
}> {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  const ct = contentTypeFor(ext);

  if (useS3 && s3) {
    const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    if (!obj.Body) throw new Error("s3: empty body");
    const nodeStream = obj.Body as unknown as NodeJS.ReadableStream;
    const stream = Readable.toWeb(Readable.from(nodeStream)) as ReadableStream;
    return {
      stream,
      size: obj.ContentLength,
      contentType: obj.ContentType ?? ct,
    };
  }

  const path = join(FS_ROOT, key);
  const info = await stat(path);
  const { createReadStream } = await import("node:fs");
  const stream = Readable.toWeb(createReadStream(path)) as ReadableStream;
  return { stream, size: info.size, contentType: ct };
}

/** Delete a stored object by key. Best-effort: missing keys are ignored. */
export async function deleteByKey(key: string): Promise<void> {
  if (!key) return;
  if (useS3 && s3) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    } catch (e) {
      console.warn("s3 delete failed (non-fatal):", key, e);
    }
    return;
  }
  try {
    await unlink(join(FS_ROOT, key));
  } catch {
    // ignore missing files
  }
}

export const storageMode = useS3 ? "s3" : "fs";
