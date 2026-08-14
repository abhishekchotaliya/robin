import { zValidator } from "@hono/zod-validator";
import { TtsRequestSchema } from "@app/core";
import { Hono } from "hono";
import { validationErrorResponse } from "../lib/errors.ts";
import { enqueueJob } from "../jobs/queue.ts";
import { synthesizeProjectAudio } from "../services/tts.ts";

export const ttsRoutes = new Hono().post(
  "/:id/tts",
  zValidator("json", TtsRequestSchema, (result, c) => {
    if (!result.success) return validationErrorResponse(c, result.error.issues);
  }),
  async (c) => {
    const projectId = c.req.param("id");
    const body = c.req.valid("json");
    // Returns immediately with a job id; the client watches /api/jobs/:id/stream.
    const job = enqueueJob(projectId, (ctx) => synthesizeProjectAudio(projectId, body, ctx));
    return c.json(job, 202);
  },
);
