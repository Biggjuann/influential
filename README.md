# Influential

Generate consistent AI influencers and short-form vertical video on command.

## What it does

1. **Persona** — Claude designs a coherent persona (name, looks, voice, content pillars, locked Flux prompt).
2. **Identity** — Flux + PuLID (via fal.ai) renders a starter pack of 4 reference shots; you pick the canonical face.
3. **Video** — for any topic, the pipeline writes a script (Claude), voices it (F5-TTS), generates a keyframe, animates 5–8s with Wan 2.2, syncs lips with LatentSync, and ffmpeg crops to 1080×1920.
4. Output is a TikTok-ready MP4.

## Stack

- Next.js 15 (App Router, TypeScript)
- **Postgres** (Drizzle ORM) for persistence
- **S3-compatible object storage** (Cloudflare R2 / AWS S3 / Backblaze B2 / MinIO) for assets
- fal.ai for all heavy ML (Flux, PuLID, Wan 2.2, F5-TTS, LatentSync)
- Anthropic SDK for text
- ffmpeg-static for local 9:16 post-processing (no system ffmpeg needed)

## Local dev

```bash
cp .env.example .env
# fill in ANTHROPIC_API_KEY, FAL_KEY, DATABASE_URL
# (optionally: S3_BUCKET + S3_PUBLIC_URL + S3_* creds — falls back to local FS if omitted)
npm install
npm run dev
```

Open http://localhost:3000.

### Mock mode

Set `USE_MOCK_PROVIDERS=1` to use placeholder images/silent videos and skip API costs. Useful for UI work. You still need `DATABASE_URL`.

## Deploy on Railway

The repo ships with a `Dockerfile` and `railway.json` ready to go.

### 1. Create the Postgres add-on
- New Project → **Add Postgres**. Railway auto-injects `DATABASE_URL` into your service env.
- The app auto-creates the `influencers`, `assets`, `jobs` tables on first boot — no manual migrations.

### 2. Create the service from this repo
- **Deploy from GitHub Repo** → select `Biggjuann/influential`, branch `claude/ai-influencer-generator-juPVJ`.
- Railway detects the `Dockerfile` automatically.

### 3. Object storage (Cloudflare R2 — recommended, cheapest)

Railway doesn't host blob storage, so we use Cloudflare R2 (S3-compatible, free 10 GB egress).

1. Cloudflare dashboard → R2 → **Create bucket** (e.g. `influential-assets`).
2. Settings → **Public access** → enable. Note the public URL (`https://pub-<id>.r2.dev`) or attach a custom domain.
3. **R2 API Tokens** → Create Token, **Object Read & Write** scoped to your bucket. Save the Access Key ID + Secret.
4. Find your account-level S3 endpoint: `https://<account-id>.r2.cloudflarestorage.com`.

### 4. Set environment variables on the Railway service

| Variable | Value |
| --- | --- |
| `ANTHROPIC_API_KEY` | from console.anthropic.com |
| `FAL_KEY` | from fal.ai/dashboard/keys |
| `S3_BUCKET` | `influential-assets` |
| `S3_PUBLIC_URL` | `https://pub-<id>.r2.dev` (or your custom domain) |
| `S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `S3_REGION` | `auto` |
| `S3_ACCESS_KEY_ID` | from R2 API token |
| `S3_SECRET_ACCESS_KEY` | from R2 API token |

`DATABASE_URL` is set automatically by the Postgres add-on. `RAILWAY_PUBLIC_DOMAIN` is set automatically once you generate a domain.

### 5. Generate a public domain

Service → Settings → Networking → **Generate Domain**. Health check is `/api/health`.

### 6. Deploy

Push the branch — Railway builds from the Dockerfile, runs migrations on first request, and serves the app on the domain you generated.

### Why this stack

- **No volume needed.** Persistence lives in Postgres + R2, both managed.
- **fal needs your reference images.** During multi-step generation (face-locked image-to-video) fal pulls the canonical image from `S3_PUBLIC_URL` directly. R2 public URLs work without auth — that's why the bucket needs public read.
- **Multi-instance safe.** Because nothing's on local disk, you can scale the service to 2+ replicas without sharding.

## Project layout

```
src/
  app/                   Next.js routes + API
    api/                 REST endpoints (health, influencers, images, videos, jobs)
    influencers/         Roster, detail, studio
  lib/
    db/                  Drizzle schema + pg client
    providers/           fal + anthropic + mock (swappable)
    pipeline/            Persona / images / video / postprocess
    storage.ts           S3 + FS-fallback storage layer
    jobs.ts              Postgres-backed job queue
    publicUrl.ts         RAILWAY_PUBLIC_DOMAIN -> base URL helper
```

## Swapping providers

`src/lib/providers/types.ts` defines the `MediaProvider` interface (`generateImage`, `generateVideo`, `tts`, `lipsync`). Anything that implements it can be plugged in via `getProvider()` in `providers/index.ts`. When you have a 24GB+ GPU, drop in a ComfyUI-backed provider without touching the pipeline.

## Notes

- Captions render as overlay text in the UI, not burned into the MP4 — `ffmpeg-static` ships without libfreetype/drawtext. Install system ffmpeg in the runtime image if you want them baked in.
- Wan 2.2 generates 5–8s clips at 720p. Multi-shot stitching isn't yet implemented — single-shot only.
- Background jobs run in-process. For higher concurrency, swap in BullMQ + Redis.
