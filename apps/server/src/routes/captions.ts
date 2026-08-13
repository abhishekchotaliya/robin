import { zValidator } from "@hono/zod-validator";
import { CaptionsRequestSchema } from "@app/core";
import { Hono } from "hono";
import { validationErrorResponse } from "../lib/errors.ts";
import { enqueueJob } from "../jobs/queue.ts";
import { generateCaptions, readCaptions } from "../services/captions.ts";

export const captionsRoutes = new Hono()
  .get("/:id/captions", async (c) => {
    // null (not 404) when captions haven't been generated yet — absence is a
    // normal state, not an error.
    return c.json(await readCaptions(c.req.param("id")));
  })

  .post(
    "/:id/captions",
    zValidator("json", CaptionsRequestSchema, (result, c) => {
      if (!result.success) return validationErrorResponse(c, result.error.issues);
    }),
    async (c) => {
      const projectId = c.req.param("id");
      const body = c.req.valid("json");
      const job = enqueueJob(projectId, (ctx) => generateCaptions(projectId, body, ctx));
      return c.json(job, 202);
    },
  );
