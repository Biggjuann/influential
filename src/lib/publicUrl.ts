import "server-only";

// Resolves the public base URL of this deployment so external services
// (fal.ai) can fetch reference assets we serve from /api/assets/...
// Priority: explicit env > Railway domain > undefined.
export function getPublicBaseUrl(): string | undefined {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  return undefined;
}

export function toAbsoluteUrl(maybeRelative: string): string {
  if (/^https?:\/\//.test(maybeRelative) || maybeRelative.startsWith("data:")) {
    return maybeRelative;
  }
  const base = getPublicBaseUrl();
  // Without a public base URL we return the relative path. Mock provider
  // tolerates this; real provider will fail with a clear fetch error pointing
  // at the missing config.
  return base ? new URL(maybeRelative, base).toString() : maybeRelative;
}
