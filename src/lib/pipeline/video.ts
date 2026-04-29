import "server-only";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getProvider } from "../providers";
import { downloadToDisk } from "../storage";
import { toAbsoluteUrl } from "../publicUrl";
import { generateScript } from "../providers/anthropic";
import { burnCaptionsAndCrop } from "./postprocess";

export async function generateVideo(args: {
  influencerId: string;
  topic: string;
  durationSec?: 5 | 8;
  onProgress?: (p: number, step: string) => void;
}) {
  const dur = args.durationSec ?? 5;
  const inf = db.select().from(schema.influencers).where(eq(schema.influencers.id, args.influencerId)).get();
  if (!inf) throw new Error("influencer not found");
  if (!inf.canonicalImageId) throw new Error("influencer has no canonical image — pick one first");

  const canon = db.select().from(schema.assets).where(eq(schema.assets.id, inf.canonicalImageId)).get();
  if (!canon) throw new Error("canonical image asset missing");

  const provider = getProvider();

  args.onProgress?.(5, "writing script");
  const script = (await generateScript({
    persona: {
      name: inf.persona.name,
      voiceDescription: inf.persona.voiceDescription,
      contentPillars: inf.persona.contentPillars,
    },
    topic: args.topic,
    durationSec: dur,
  })) as {
    hook: string;
    spokenLine: string;
    visualDirection: string;
    captionText: string;
    hashtags: string[];
  };

  args.onProgress?.(15, "rendering keyframe");
  const keyframe = await provider.generateImage({
    prompt: `${inf.persona.visualPrompt}, ${script.visualDirection}`,
    negativePrompt: inf.persona.negativePrompt,
    aspectRatio: "9:16",
    faceReferenceUrl: toAbsoluteUrl(canon.url),
    count: 1,
  });
  const keyframeUrl = keyframe.images[0].url;

  args.onProgress?.(35, "voicing line");
  const tts = await provider.tts({
    text: script.spokenLine,
    voiceRefUrl: inf.voiceRefUrl ?? undefined,
    voiceDescription: inf.persona.voiceDescription,
  });

  args.onProgress?.(50, "animating clip");
  const video = await provider.generateVideo({
    imageUrl: keyframeUrl,
    prompt: script.visualDirection,
    durationSec: dur,
  });

  args.onProgress?.(75, "syncing lips");
  const synced = await provider.lipsync({ videoUrl: video.videoUrl, audioUrl: tts.audioUrl });

  args.onProgress?.(88, "burning captions");
  const downloaded = await downloadToDisk(synced.videoUrl, "mp4", `${inf.id}/video-raw`);
  const finalPath = await burnCaptionsAndCrop({
    inputPath: downloaded.path,
    captionText: script.captionText,
    influencerId: inf.id,
  });

  const id = nanoid(12);
  const publicUrl = `/api/assets/${inf.id}/video-final/${finalPath.split("/").pop()}`;
  db.insert(schema.assets)
    .values({
      id,
      influencerId: inf.id,
      kind: "video",
      url: publicUrl,
      localPath: finalPath,
      meta: {
        topic: args.topic,
        script,
        durationSec: dur,
        keyframeUrl,
      },
    })
    .run();

  args.onProgress?.(100, "done");
  return { assetId: id, url: publicUrl, script };
}
