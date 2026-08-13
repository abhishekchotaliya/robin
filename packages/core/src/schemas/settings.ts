import { z } from "zod";

// Phase 0: minimal shape to prove the cross-package import chain works.
// Full schema (providers, render defaults, defaultVoice) lands in Phase 1.
export const SettingsSchema = z.object({
  projectsRoot: z.string(),
});
export type Settings = z.infer<typeof SettingsSchema>;
