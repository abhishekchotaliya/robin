import { z } from "zod";
import { KenBurnsSchema } from "./project.ts";

// This is what Remotion's inputProps actually receives. NEVER pass a raw
// Project as inputProps — the server compiles Project -> RenderManifest so
// the UI schema can change without breaking rendering.

export const ManifestWordSchema = z.object({
  text: z.string(),
  startMs: z.number(),
  endMs: z.number(),
});
export type ManifestWord = z.infer<typeof ManifestWordSchema>;

export const ManifestCaptionLineSchema = z.object({
  words: z.array(ManifestWordSchema),
  startMs: z.number(),
  endMs: z.number(),
});
export type ManifestCaptionLine = z.infer<typeof ManifestCaptionLineSchema>;

// captions/words.json — whisper output in the project's timeline space,
// with the hash it was produced from so a re-run can skip when nothing that
// affects the audio has changed.
export const CaptionsFileSchema = z.object({
  hash: z.string(),
  model: z.string(),
  createdAt: z.string(),
  words: z.array(ManifestWordSchema),
});
export type CaptionsFile = z.infer<typeof CaptionsFileSchema>;

export const ManifestSceneMediaSchema = z.object({
  kind: z.enum(["image", "video", "color"]),
  src: z.string().nullable(), // URL (preview, pathMode "http") or absolute path (render, pathMode "fs")
  fit: z.enum(["cover", "contain"]),
  color: z.string(),
  kenBurns: KenBurnsSchema,
});
export type ManifestSceneMedia = z.infer<typeof ManifestSceneMediaSchema>;

export const ManifestSceneSchema = z.object({
  id: z.string(),
  from: z.number().int(), // start frame, resolved
  durationInFrames: z.number().int(),
  media: ManifestSceneMediaSchema,
  overlayText: z.string().nullable(),
});
export type ManifestScene = z.infer<typeof ManifestSceneSchema>;

export const RenderManifestSchema = z.object({
  width: z.number().int(),
  height: z.number().int(),
  fps: z.number().int(),
  durationInFrames: z.number().int(),
  scenes: z.array(ManifestSceneSchema),
  audioSrc: z.string().nullable(), // master.wav — the ONLY audio Remotion sees
  captions: z.object({
    enabled: z.boolean(),
    style: z.enum(["bold-center", "subtle-lower"]),
    lines: z.array(ManifestCaptionLineSchema), // pre-grouped at compile time, never at render time
  }),
});
export type RenderManifest = z.infer<typeof RenderManifestSchema>;
