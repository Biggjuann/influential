# syntax=docker/dockerfile:1.7

# ── builder ──────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund --prefer-offline

COPY . .
RUN npm run build

# ── runtime ──────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# ffmpeg-static ships its own binary; we just need libstdc++, certs, and fonts
# (sharp's SVG renderer needs system fonts via fontconfig — without them,
# captions render as missing-glyph boxes).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      fonts-dejavu-core \
      fonts-noto-core \
      fontconfig \
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/*

# Next standalone bundles only what the server needs (including native deps
# flagged via serverExternalPackages — pg, ffmpeg-static, etc).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# The Next tracer copies ffmpeg-static's JS but not its bundled binary. Pull
# the full package over the traced one so the spawn at runtime resolves.
COPY --from=builder /app/node_modules/ffmpeg-static ./node_modules/ffmpeg-static

EXPOSE 3000
CMD ["node", "server.js"]
