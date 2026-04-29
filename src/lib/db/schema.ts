import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const influencers = sqliteTable("influencers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  niche: text("niche").notNull(),
  persona: text("persona", { mode: "json" }).$type<Persona>().notNull(),
  canonicalImageId: text("canonical_image_id"),
  voiceRefUrl: text("voice_ref_url"),
  createdAt: integer("created_at").notNull().default(sql`(strftime('%s','now'))`),
});

export const assets = sqliteTable("assets", {
  id: text("id").primaryKey(),
  influencerId: text("influencer_id").notNull(),
  kind: text("kind", { enum: ["image", "video", "audio"] }).notNull(),
  url: text("url").notNull(),
  localPath: text("local_path"),
  meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at").notNull().default(sql`(strftime('%s','now'))`),
});

export const jobs = sqliteTable("jobs", {
  id: text("id").primaryKey(),
  influencerId: text("influencer_id"),
  kind: text("kind", { enum: ["persona", "images", "video"] }).notNull(),
  status: text("status", { enum: ["queued", "running", "done", "error"] }).notNull(),
  progress: integer("progress").notNull().default(0),
  step: text("step"),
  input: text("input", { mode: "json" }).$type<Record<string, unknown>>(),
  output: text("output", { mode: "json" }).$type<Record<string, unknown>>(),
  error: text("error"),
  createdAt: integer("created_at").notNull().default(sql`(strftime('%s','now'))`),
  updatedAt: integer("updated_at").notNull().default(sql`(strftime('%s','now'))`),
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
