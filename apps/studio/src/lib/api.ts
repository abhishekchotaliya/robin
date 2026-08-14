import {
  ApiErrorSchema,
  AssetSchema,
  CaptionsFileSchema,
  CaptionsRequestSchema,
  CreateProjectRequestSchema,
  MixRequestSchema,
  HealthSchema,
  HealthCheckSchema,
  ProjectListItemSchema,
  ProjectSchema,
  RenderJobSchema,
  RenderRequestSchema,
  RenderManifestSchema,
  SettingsPublicSchema,
  TTSProviderInfoSchema,
  TtsRequestSchema,
  UpdateProjectRequestSchema,
  UpdateSettingsRequestSchema,
  VoiceOptionSchema,
  type CaptionsRequest,
  type CreateProjectRequest,
  type MixRequest,
  type Project,
  type RenderJob,
  type RenderRequest,
  type TtsRequest,
  type UpdateProjectRequest,
  type UpdateSettingsRequest,
} from "@app/core";
import { z } from "zod";

// The ONLY module in the app that knows fetch/HTTP. Every response is
// parsed with the shared core schema, so a drifting server fails loudly
// here in dev instead of producing a confusing UI bug three components away.
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly issues?: unknown[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  // Never set Content-Type for FormData — the browser has to supply it
  // itself so it can include the multipart boundary. Setting it by hand
  // produces a body the server can't parse.
  const isFormData = init?.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: isFormData ? init?.headers : { "Content-Type": "application/json", ...init?.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const parsed = ApiErrorSchema.safeParse(body);
    if (parsed.success) {
      throw new ApiError(parsed.data.error.code, parsed.data.error.message, res.status, parsed.data.error.issues);
    }
    throw new ApiError("INTERNAL", `request failed with status ${res.status}`, res.status);
  }

  if (res.status === 204) return undefined as T;
  return schema.parse(await res.json());
}

export const api = {
  health: () => request("/health", HealthSchema),

  listProjects: () => request("/projects", z.array(ProjectListItemSchema)),

  getProject: (id: string) => request(`/projects/${id}`, ProjectSchema),

  createProject: (body: CreateProjectRequest) =>
    request("/projects", ProjectSchema, {
      method: "POST",
      body: JSON.stringify(CreateProjectRequestSchema.parse(body)),
    }),

  updateProject: (id: string, patch: UpdateProjectRequest) =>
    request(`/projects/${id}`, ProjectSchema, {
      method: "PATCH",
      body: JSON.stringify(UpdateProjectRequestSchema.parse(patch)),
    }),

  duplicateProject: (id: string) =>
    request(`/projects/${id}/duplicate`, ProjectSchema, { method: "POST" }),

  healthChecks: () => request("/settings/health", z.array(HealthCheckSchema)),

  deleteProject: (id: string) => request<void>(`/projects/${id}`, z.void(), { method: "DELETE" }),

  listAssets: (projectId: string) => request(`/projects/${projectId}/assets`, z.array(AssetSchema)),

  uploadAssets: (projectId: string, files: File[]) => {
    const form = new FormData();
    for (const file of files) form.append("files", file);
    return request(`/projects/${projectId}/assets`, z.array(AssetSchema), { method: "POST", body: form });
  },

  deleteAsset: (projectId: string, assetId: string) =>
    request<void>(`/projects/${projectId}/assets/${assetId}`, z.void(), { method: "DELETE" }),

  getSettings: () => request("/settings", SettingsPublicSchema),

  updateSettings: (patch: UpdateSettingsRequest) =>
    request("/settings", SettingsPublicSchema, {
      method: "PATCH",
      body: JSON.stringify(UpdateSettingsRequestSchema.parse(patch)),
    }),

  listVoices: (providerId: string) =>
    request(`/settings/voices/${providerId}`, z.array(VoiceOptionSchema)),

  listTtsProviders: () => request("/settings/tts-providers", z.array(TTSProviderInfoSchema)),

  generateTts: (projectId: string, body: TtsRequest) =>
    request(`/projects/${projectId}/tts`, RenderJobSchema, {
      method: "POST",
      body: JSON.stringify(TtsRequestSchema.parse(body)),
    }),

  // null is a normal answer here: captions simply haven't been generated yet.
  getCaptions: (projectId: string) =>
    request(`/projects/${projectId}/captions`, CaptionsFileSchema.nullable()),

  generateCaptions: (projectId: string, body: CaptionsRequest) =>
    request(`/projects/${projectId}/captions`, RenderJobSchema, {
      method: "POST",
      body: JSON.stringify(CaptionsRequestSchema.parse(body)),
    }),

  getManifest: (projectId: string) => request(`/projects/${projectId}/manifest`, RenderManifestSchema),

  getMixStatus: (projectId: string) =>
    request(
      `/projects/${projectId}/mix`,
      z.object({ exists: z.boolean(), upToDate: z.boolean(), file: z.string().nullable() }),
    ),

  buildMix: (projectId: string, body: MixRequest) =>
    request(`/projects/${projectId}/mix`, RenderJobSchema, {
      method: "POST",
      body: JSON.stringify(MixRequestSchema.parse(body)),
    }),

  startRender: (projectId: string, body: RenderRequest) =>
    request(`/projects/${projectId}/render`, RenderJobSchema, {
      method: "POST",
      body: JSON.stringify(RenderRequestSchema.parse(body)),
    }),

  listRenders: (projectId: string) =>
    request(
      `/projects/${projectId}/renders`,
      z.object({
        upToDate: z.boolean(),
        renders: z.array(
          z.object({
            filename: z.string(),
            path: z.string(),
            bytes: z.number(),
            createdAt: z.string(),
            isLatest: z.boolean(),
          }),
        ),
      }),
    ),

  getJob: (jobId: string) => request(`/jobs/${jobId}`, RenderJobSchema),

  cancelJob: (jobId: string) => request(`/jobs/${jobId}/cancel`, RenderJobSchema, { method: "POST" }),
};

// Media is served by the server, not bundled — the browser can't read disk.
export function assetUrl(projectSlug: string, filename: string): string {
  return `/files/${projectSlug}/assets/${filename}`;
}

/** `file` is already project-relative (e.g. "audio/vo/<hash>.mp3"). */
export function projectFileUrl(projectSlug: string, file: string): string {
  return `/files/${projectSlug}/${file}`;
}

/**
 * Streams job progress over SSE. Returns an unsubscribe function; the caller
 * is responsible for closing when the component unmounts.
 */
export function streamJob(
  jobId: string,
  handlers: { onProgress: (job: RenderJob) => void; onError?: (message: string) => void },
): () => void {
  const source = new EventSource(`/api/jobs/${jobId}/stream`);

  source.addEventListener("progress", (event) => {
    const parsed = RenderJobSchema.safeParse(JSON.parse((event as MessageEvent<string>).data));
    if (!parsed.success) return;
    handlers.onProgress(parsed.data);
    // The server closes the stream once a job is terminal; close our side
    // too so the browser doesn't auto-reconnect to a finished job forever.
    if (["done", "error", "cancelled"].includes(parsed.data.state)) source.close();
  });

  source.onerror = () => {
    // EventSource fires this on normal close too, so only surface it while
    // the connection was still expected to be open.
    if (source.readyState !== EventSource.CLOSED) {
      handlers.onError?.("Lost connection to the job stream.");
      source.close();
    }
  };

  return () => source.close();
}

export type { Project };
