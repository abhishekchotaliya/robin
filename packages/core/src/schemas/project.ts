import { z } from "zod";

export const FormatSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive(),
});
export type Format = z.infer<typeof FormatSchema>;

export const FORMAT_PRESETS = {
  shorts: { width: 1080, height: 1920, fps: 30 },
  landscape: { width: 1920, height: 1080, fps: 30 },
  square: { width: 1080, height: 1080, fps: 30 },
} as const satisfies Record<string, Format>;

export const FormatPresetSchema = z.enum(["shorts", "landscape", "square"]);
export type FormatPreset = z.infer<typeof FormatPresetSchema>;

export const KenBurnsSchema = z.object({
  enabled: z.boolean(),
  direction: z.enum(["in", "out"]),
  zoomFrom: z.number(),
  zoomTo: z.number(),
});
export type KenBurns = z.infer<typeof KenBurnsSchema>;

export const DEFAULT_KEN_BURNS: KenBurns = {
  enabled: true,
  direction: "in",
  zoomFrom: 1.0,
  zoomTo: 1.08,
};

export const SceneMediaSchema = z.object({
  kind: z.enum(["image", "video", "color"]),
  assetId: z.string().nullable(), // null when kind === "color"
  fit: z.enum(["cover", "contain"]),
  color: z.string(), // hex fallback / used when kind === "color"
  kenBurns: KenBurnsSchema,
});
export type SceneMedia = z.infer<typeof SceneMediaSchema>;

export const SceneAudioSchema = z.object({
  file: z.string(), // relative to project dir, e.g. "audio/vo/ab12….mp3"
  durationMs: z.number(),
  hash: z.string(), // hash(text+voiceId+speed+stability) at synthesis time — compare to detect staleness
});
export type SceneAudio = z.infer<typeof SceneAudioSchema>;

export const TransitionSchema = z.object({
  type: z.enum(["none", "fade", "slide"]),
  durationMs: z.number(),
});
export type Transition = z.infer<typeof TransitionSchema>;

export const SceneSchema = z.object({
  id: z.string(),
  order: z.number().int(),
  text: z.string(), // narration — drives everything (narration-driven timing)
  overlayText: z.string().nullable(), // optional on-screen title, NOT narrated
  media: SceneMediaSchema,
  audio: SceneAudioSchema.nullable(), // null until TTS runs; stale if hash mismatch
  transitionOut: TransitionSchema,
});
export type Scene = z.infer<typeof SceneSchema>;

export const VoiceConfigSchema = z.object({
  providerId: z.string(), // "elevenlabs"
  voiceId: z.string(),
  speed: z.number(), // 1.0 default
  stability: z.number(), // 0-1
});
export type VoiceConfig = z.infer<typeof VoiceConfigSchema>;

export const BgmConfigSchema = z.object({
  assetId: z.string().nullable(),
  gainDb: z.number(), // default -18
  duckingDb: z.number(), // extra attenuation under speech, default -12
  fadeInMs: z.number(),
  fadeOutMs: z.number(),
});
export type BgmConfig = z.infer<typeof BgmConfigSchema>;

export const CaptionConfigSchema = z.object({
  enabled: z.boolean(),
  style: z.enum(["bold-center", "subtle-lower"]),
  maxWordsPerLine: z.number().int(), // default 4
});
export type CaptionConfig = z.infer<typeof CaptionConfigSchema>;

export const ProjectStatusSchema = z.enum(["draft", "scripted", "voiced", "ready", "rendered"]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const LastRenderSchema = z.object({
  path: z.string(),
  renderedAt: z.string(),
  durationMs: z.number(),
  manifestHash: z.string(),
});
export type LastRender = z.infer<typeof LastRenderSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  slug: z.string(), // folder name; immutable after creation
  title: z.string().min(1),
  status: ProjectStatusSchema, // derived by deriveStatus() on every write, persisted for fast listing
  createdAt: z.string(), // ISO 8601
  updatedAt: z.string(),
  format: FormatSchema,
  templateId: z.string(), // "shorts-basic"
  voice: VoiceConfigSchema,
  bgm: BgmConfigSchema,
  captions: CaptionConfigSchema,
  scenes: z.array(SceneSchema),
  lastRender: LastRenderSchema.nullable(),
});
export type Project = z.infer<typeof ProjectSchema>;
