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

# System ffmpeg with libass + libfreetype + libx264 for proper caption
# rendering (libass via the subtitles filter — broadcast quality, real font
# kerning, animations). System ffmpeg replaces ffmpeg-static at runtime;
# the static binary is still bundled for environments where the system one
# is unavailable.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      ffmpeg \
      fontconfig \
      fonts-dejavu \
      fonts-noto-core \
      fonts-noto-extra \
      fonts-liberation \
      fonts-roboto \
      fonts-open-sans \
    && mkdir -p /usr/share/fonts/truetype/google \
    && curl -fsSL -o /usr/share/fonts/truetype/google/Pacifico-Regular.ttf \
        https://github.com/google/fonts/raw/main/ofl/pacifico/Pacifico-Regular.ttf \
    && curl -fsSL -o /usr/share/fonts/truetype/google/Lobster-Regular.ttf \
        https://github.com/google/fonts/raw/main/ofl/lobster/Lobster-Regular.ttf \
    && fc-cache -fv \
    && apt-get purge -y curl \
    && apt-get autoremove -y \
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
