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

// POST /api/projects/:id/tts — omit sceneIds to synthesize every scene whose
// audio is missing or stale.
export const TtsRequestSchema = z.object({
  sceneIds: z.array(z.string()).optional(),
  /** Re-synthesize even when the cached hash matches. */
  force: z.boolean().optional(),
});
export type TtsRequest = z.infer<typeof TtsRequestSchema>;

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
