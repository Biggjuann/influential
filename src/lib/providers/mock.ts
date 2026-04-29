import "server-only";
import zlib from "node:zlib";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import type { MediaProvider } from "./types";

// Generate a tiny solid-color PNG entirely in-process so mock mode works
// fully offline (no external placeholder hosts needed).
function colorPng(r: number, g: number, b: number) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); // width
  ihdr.writeUInt32BE(1, 4); // height
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idatRaw = Buffer.from([0, r, g, b]);
  const idatCompressed = zlib.deflateSync(idatRaw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idatCompressed), chunk("IEND", Buffer.alloc(0))]);
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function placeholderImage(seed: number) {
  // Hash seed -> a pleasant pastel color so each scene looks distinct.
  const r = 100 + (seed * 7919) % 130;
  const g = 100 + (seed * 6151) % 130;
  const b = 100 + (seed * 4357) % 130;
  return `data:image/png;base64,${colorPng(r & 255, g & 255, b & 255).toString("base64")}`;
}

// Lazily generate a real valid 1-second mp4 using ffmpeg-static so mock-mode
// videos survive the ffmpeg post-processing step. Cached on disk.
let mp4Promise: Promise<string> | null = null;
async function getMockMp4Url(): Promise<string> {
  mp4Promise ??= (async () => {
    const dir = resolve(process.env.STORAGE_DIR ?? "./data/assets");
    await mkdir(dir, { recursive: true });
    const path = join(dir, "_mock-sample.mp4");
    if (existsSync(path)) return pathToFileURL(path).toString();
    const bin = ffmpegPath as unknown as string | null;
    if (!bin) throw new Error("ffmpeg-static not found");
    await new Promise<void>((resolve, reject) => {
      const args = [
        "-y",
        "-f", "lavfi",
        "-i", "color=c=hotpink:s=720x1280:d=2",
        "-f", "lavfi",
        "-i", "anullsrc=r=44100:cl=mono",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-t", "2",
        "-c:a", "aac", "-shortest",
        path,
      ];
      const p = spawn(bin, args);
      p.on("close", (code: number | null) =>
        code === 0 ? resolve() : reject(new Error(`ffmpeg failed ${code}`)),
      );
      p.on("error", reject);
    });
    return pathToFileURL(path).toString();
  })();
  return mp4Promise;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const mockProvider: MediaProvider = {
  async generateImage(input) {
    await sleep(400);
    const count = input.count ?? 1;
    const baseSeed = input.seed ?? Math.floor(Math.random() * 1e9);
    return {
      images: Array.from({ length: count }, (_, i) => ({
        url: placeholderImage(baseSeed + i),
        width: 768,
        height: 1344,
        seed: baseSeed + i,
      })),
    };
  },
  async generateVideo() {
    await sleep(800);
    const videoUrl = await getMockMp4Url();
    return { videoUrl, width: 720, height: 1280, durationSec: 5 };
  },
  async tts(input) {
    await sleep(200);
    // empty wav (RIFF header only)
    const wav = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
      0x10, 0, 0, 0, 1, 0, 1, 0, 0x44, 0xac, 0, 0, 0x88, 0x58, 1, 0, 2, 0, 0x10, 0,
      0x64, 0x61, 0x74, 0x61, 0, 0, 0, 0,
    ]);
    return {
      audioUrl: `data:audio/wav;base64,${wav.toString("base64")}`,
      durationSec: Math.max(2, input.text.length / 15),
    };
  },
  async lipsync(input) {
    await sleep(500);
    return { videoUrl: input.videoUrl };
  },
};
