# Influential

Generate consistent AI influencers and short-form vertical video on command.

## What it does

1. **Persona** — Claude designs a coherent persona (name, looks, voice, content pillars, locked Flux prompt).
2. **Identity** — Flux + PuLID (via fal.ai) renders a starter pack of 4 reference shots; you pick the canonical face.
3. **Video** — for any topic, the pipeline writes a script (Claude), voices it (F5-TTS), generates a keyframe, animates 5–8s with Wan 2.2, syncs lips with LatentSync, and ffmpeg crops to 1080×1920 with burned-in captions.
4. Output is a TikTok-ready MP4.

## Stack

- Next.js 15 (App Router, TypeScript)
- SQLite + Drizzle (zero-setup persistence)
- fal.ai for all heavy ML (Flux, PuLID, Wan 2.2, F5-TTS, LatentSync) — runs from your laptop
- Anthropic SDK for text
- ffmpeg-static for local post-processing

## Setup

```bash
cp .env.example .env
# fill in ANTHROPIC_API_KEY and FAL_KEY
npm install
npm run dev
```

Open http://localhost:3000.

### Mock mode

Set `USE_MOCK_PROVIDERS=1` in `.env` to use placeholder images/videos and skip API costs. Useful for UI work.

## Project layout

```
src/
  app/                   Next.js routes + API
    api/                 REST endpoints
    influencers/         Roster, detail, studio
  lib/
    db/                  SQLite + Drizzle schema
    providers/           fal + anthropic + mock (swappable)
    pipeline/            Persona / images / video / postprocess
    jobs.ts              SQLite-backed job queue
data/                    SQLite db + generated assets (gitignored)
```

## Swapping providers

`src/lib/providers/types.ts` defines the `MediaProvider` interface. Anything that implements it (`generateImage`, `generateVideo`, `tts`, `lipsync`) can be plugged in via `getProvider()` in `providers/index.ts`. When you have a 24GB+ GPU, you can drop in a ComfyUI-backed provider without touching pipeline code.

## Notes

- All assets are stored locally under `data/assets/` and served via `/api/assets/...`. Switch to S3/R2 by modifying `src/lib/storage.ts`.
- Jobs are tracked in SQLite and polled from the client. For higher throughput, swap in BullMQ + Redis.
- Wan 2.2 generates ~5s clips at 720p. Stitching multi-shot videos isn't yet implemented — single-shot only.
