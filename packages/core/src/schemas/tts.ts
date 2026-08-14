import { z } from "zod";

// A voice as offered by a provider. Deliberately provider-agnostic: adding
// a second TTS engine must not change this shape or the UI that renders it.
export const VoiceOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  description: z.string().nullable(),
  previewUrl: z.string().nullable(),
  labels: z.record(z.string(), z.string()),
});
export type VoiceOption = z.infer<typeof VoiceOptionSchema>;

// GET /api/settings/tts-providers — lets the UI offer a provider picker
// without hardcoding provider ids; `configured` mirrors each provider's own
// isConfigured(settings) so a key-free local provider (e.g. macOS say) is
// simply always configured.
export const TTSProviderInfoSchema = z.object({
  id: z.string(),
  label: z.string(),
  configured: z.boolean(),
});
export type TTSProviderInfo = z.infer<typeof TTSProviderInfoSchema>;

// POST /api/projects/:id/tts — omit sceneIds to synthesize every scene whose
// audio is missing or stale.
export const TtsRequestSchema = z.object({
  sceneIds: z.array(z.string()).optional(),
  /** Re-synthesize even when the cached hash matches. */
  force: z.boolean().optional(),
});
export type TtsRequest = z.infer<typeof TtsRequestSchema>;

// POST /api/projects/:id/captions
export const CaptionsRequestSchema = z.object({
  /** Re-transcribe even when the cached hash matches. */
  force: z.boolean().optional(),
});
export type CaptionsRequest = z.infer<typeof CaptionsRequestSchema>;

// POST /api/projects/:id/mix
export const MixRequestSchema = z.object({
  /** Rebuild the master even when the cached hash matches. */
  force: z.boolean().optional(),
});
export type MixRequest = z.infer<typeof MixRequestSchema>;

// POST /api/projects/:id/render
export const RenderRequestSchema = z.object({
  /** Redo every step even when caches are valid. */
  force: z.boolean().optional(),
});
export type RenderRequest = z.infer<typeof RenderRequestSchema>;

// PATCH /api/settings. API keys are write-only: they can be set here but the
// GET response only ever reports whether one is configured.
export const UpdateSettingsRequestSchema = z.object({
  defaultFormat: z.enum(["shorts", "landscape", "square"]).optional(),
  defaultTemplateId: z.string().optional(),
  defaultVoice: z
    .object({
      providerId: z.string(),
      voiceId: z.string(),
      speed: z.number(),
      stability: z.number(),
    })
    .optional(),
  render: z.object({ codec: z.enum(["h264"]), crf: z.number().int() }).optional(),
  providers: z
    .object({
      // null clears the stored key; omitting the field leaves it untouched.
      elevenlabs: z.object({ apiKey: z.string() }).nullable().optional(),
    })
    .optional(),
});
export type UpdateSettingsRequest = z.infer<typeof UpdateSettingsRequestSchema>;
