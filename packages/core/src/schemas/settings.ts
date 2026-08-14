import { z } from "zod";
import { FormatPresetSchema, VoiceConfigSchema } from "./project.ts";

export const SettingsSchema = z.object({
  projectsRoot: z.string(),
  defaultFormat: FormatPresetSchema,
  defaultTemplateId: z.string(),
  defaultVoice: VoiceConfigSchema,
  providers: z.object({
    elevenlabs: z.object({ apiKey: z.string() }).nullable(),
  }),
  render: z.object({
    codec: z.enum(["h264"]),
    crf: z.number().int(),
  }),
});
export type Settings = z.infer<typeof SettingsSchema>;

// What the API actually returns: key PRESENCE, never key VALUES. Never send
// SettingsSchema-shaped data to the browser — that would leak API keys.
export const SettingsPublicSchema = z.object({
  projectsRoot: z.string(),
  defaultFormat: FormatPresetSchema,
  defaultTemplateId: z.string(),
  defaultVoice: VoiceConfigSchema,
  providers: z.object({
    elevenlabs: z.object({ configured: z.boolean() }),
  }),
  render: z.object({
    codec: z.enum(["h264"]),
    crf: z.number().int(),
  }),
});
export type SettingsPublic = z.infer<typeof SettingsPublicSchema>;

export function toPublicSettings(settings: Settings): SettingsPublic {
  return {
    projectsRoot: settings.projectsRoot,
    defaultFormat: settings.defaultFormat,
    defaultTemplateId: settings.defaultTemplateId,
    defaultVoice: settings.defaultVoice,
    providers: {
      elevenlabs: { configured: settings.providers.elevenlabs !== null },
    },
    render: settings.render,
  };
}

export const DEFAULT_SETTINGS: Omit<Settings, "projectsRoot"> = {
  defaultFormat: "shorts",
  defaultTemplateId: "shorts-basic",
  defaultVoice: {
    providerId: "elevenlabs",
    voiceId: "",
    speed: 1.0,
    stability: 0.5,
  },
  providers: {
    elevenlabs: null,
  },
  render: {
    codec: "h264",
    crf: 18,
  },
};
