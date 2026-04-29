import "server-only";
import type { MediaProvider } from "./types";
import { falProvider } from "./fal";
import { mockProvider } from "./mock";

export function getProvider(): MediaProvider {
  if (process.env.USE_MOCK_PROVIDERS === "1" || !process.env.FAL_KEY) {
    return mockProvider;
  }
  return falProvider;
}

export type { MediaProvider } from "./types";
