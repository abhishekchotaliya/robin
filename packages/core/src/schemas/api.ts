import { z } from "zod";

export const HealthSchema = z.object({
  ok: z.boolean(),
  version: z.string(),
  bun: z.string(),
  projectsRoot: z.string(),
});
export type Health = z.infer<typeof HealthSchema>;
