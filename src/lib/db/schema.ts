import { pgTable, text, integer, jsonb, bigint } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const influencers = pgTable("influencers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  niche: text("niche").notNull(),
  persona: jsonb("persona").$type<Persona>().notNull(),
  canonicalImageId: text("canonical_image_id"),
  voiceRefUrl: text("voice_ref_url"),
  createdAt: bigint("created_at", { mode: "number" }).notNull().default(sql`extract(epoch from now())::bigint`),
});

export const assets = pgTable("assets", {
  id: text("id").primaryKey(),
  influencerId: text("influencer_id").notNull(),
  kind: text("kind", { enum: ["image", "video", "audio"] }).notNull(),
  url: text("url").notNull(),
  storageKey: text("storage_key"),
  meta: jsonb("meta").$type<Record<string, unknown>>(),
  createdAt: bigint("created_at", { mode: "number" }).notNull().default(sql`extract(epoch from now())::bigint`),
});

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  influencerId: text("influencer_id"),
  kind: text("kind", { enum: ["persona", "images", "video"] }).notNull(),
  status: text("status", { enum: ["queued", "running", "done", "error"] }).notNull(),
  progress: integer("progress").notNull().default(0),
  step: text("step"),
  input: jsonb("input").$type<Record<string, unknown>>(),
  output: jsonb("output").$type<Record<string, unknown>>(),
  error: text("error"),
  createdAt: bigint("created_at", { mode: "number" }).notNull().default(sql`extract(epoch from now())::bigint`),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull().default(sql`extract(epoch from now())::bigint`),
});

export type Persona = {
  name: string;
  age: number;
  ethnicity: string;
  hair: string;
  eyes: string;
  build: string;
  style: string;
  backstory: string;
  voiceDescription: string;
  contentPillars: string[];
  visualPrompt: string;
  negativePrompt: string;
};

export type Influencer = typeof influencers.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type Job = typeof jobs.$inferSelect;
