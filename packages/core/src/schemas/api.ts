import { z } from "zod";
import { FormatPresetSchema, FpsOptionSchema, ProjectSchema, ProjectStatusSchema, ResolutionTierSchema } from "./project.ts";

export const HealthSchema = z.object({
  ok: z.boolean(),
  version: z.string(),
  bun: z.string(),
  projectsRoot: z.string(),
});
export type Health = z.infer<typeof HealthSchema>;

// One native-tool health check for the settings screen.
export const HealthCheckSchema = z.object({
  name: z.string(),
  ok: z.boolean(),
  detail: z.string(),
  /** What to do about it, when there is something to do. */
  hint: z.string().nullable(),
});
export type HealthCheck = z.infer<typeof HealthCheckSchema>;

// GET /api/projects — lightweight, no scenes/media payload.
export const ProjectListItemSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  status: ProjectStatusSchema,
  updatedAt: z.string(),
  sceneCount: z.number().int(),
  estimatedDurationMs: z.number(),
  thumbnailUrl: z.string().nullable(),
});
export type ProjectListItem = z.infer<typeof ProjectListItemSchema>;

// POST /api/projects
export const CreateProjectRequestSchema = z.object({
  title: z.string().min(1),
  formatPreset: FormatPresetSchema,
  resolution: ResolutionTierSchema,
  fps: FpsOptionSchema,
  templateId: z.string(),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

// PATCH /api/projects/:id — everything optional except identity fields, which
// can't be patched (slug is immutable, id/status/timestamps are server-owned).
export const UpdateProjectRequestSchema = ProjectSchema.omit({
  id: true,
  slug: true,
  status: true,
  createdAt: true,
  updatedAt: true,
}).partial();
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>;

// Uniform error shape for every non-2xx response.
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.enum(["VALIDATION", "NOT_FOUND", "CONFLICT", "INTERNAL"]),
    message: z.string(),
    issues: z.array(z.record(z.string(), z.unknown())).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
