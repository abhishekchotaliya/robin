import { zValidator } from "@hono/zod-validator";
import { MixRequestSchema, mixHash } from "@app/core";
import { Hono } from "hono";
import { NotFoundError, validationErrorResponse } from "../lib/errors.ts";
import { enqueueJob } from "../jobs/queue.ts";
import { pathExists } from "../lib/fsx.ts";
import { MASTER_FILE, buildMasterAudio } from "../services/mix.ts";
import { getProject, projectDir } from "../store/projects.ts";
import { join } from "node:path";

export const mixRoutes = new Hono()
  // Whether a master exists and whether it still matches the current
  // settings — the UI needs both to label its button honestly.
  .get("/:id/mix", async (c) => {
    const project = await getProject(c.req.param("id"));
    if (!project) throw new NotFoundError(`project ${c.req.param("id")} not found`);

    const dir = projectDir(project.slug);
    const exists = await pathExists(join(dir, MASTER_FILE));
    const stampPath = join(dir, ".cache", "master.hash");
    const stamp = (await pathExists(stampPath)) ? (await Bun.file(stampPath).text()).trim() : null;

    return c.json({
      exists,
      upToDate: exists && stamp === mixHash(project),
      file: exists ? MASTER_FILE : null,
    });
  })

  .post(
    "/:id/mix",
    zValidator("json", MixRequestSchema, (result, c) => {
      if (!result.success) return validationErrorResponse(c, result.error.issues);
    }),
    async (c) => {
      const projectId = c.req.param("id");
      const body = c.req.valid("json");
      const job = enqueueJob(projectId, (ctx) => buildMasterAudio(projectId, body, ctx));
      return c.json(job, 202);
    },
  );
