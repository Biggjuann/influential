# syntax=docker/dockerfile:1.7

# ── builder ──────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# better-sqlite3 needs a C++ toolchain to compile its native binding.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ── runtime ──────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV STORAGE_DIR=/data/assets
ENV DB_PATH=/data/influential.db

# ffmpeg-static ships its own binary; we just need libstdc++ and certs.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Next standalone bundles only what the server needs (including native deps
# flagged via serverExternalPackages — better-sqlite3, ffmpeg-static, etc).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

RUN mkdir -p /data/assets

EXPOSE 3000
CMD ["node", "server.js"]
