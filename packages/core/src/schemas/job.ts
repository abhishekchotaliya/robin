import { z } from "zod";

export const JobStepSchema = z.enum([
  "validate",
  "tts",
  "probe",
  "timeline",
  "captions",
  "mix",
  "render",
]);
export type JobStep = z.infer<typeof JobStepSchema>;

export const JobStateSchema = z.enum(["queued", "running", "done", "error", "cancelled"]);
export type JobState = z.infer<typeof JobStateSchema>;

export const RenderJobSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  state: JobStateSchema,
  step: JobStepSchema.nullable(),
  progress: z.number(), // 0-1 overall
  log: z.array(z.string()),
  outputPath: z.string().nullable(),
  error: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type RenderJob = z.infer<typeof RenderJobSchema>;
