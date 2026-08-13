import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { zValidator } from "@hono/zod-validator";
import { RenderRequestSchema, manifestHash } from "@app/core";
import { Hono } from "hono";
import { NotFoundError, validationErrorResponse } from "../lib/errors.ts";
import { enqueueJob } from "../jobs/queue.ts";
import { dirExists } from "../lib/fsx.ts";
import { runRenderPipeline } from "../services/pipeline.ts";
import { buildRenderManifest } from "../services/renderer.ts";
import { getProject, projectDir } from "../store/projects.ts";

export const renderRoutes = new Hono()
  .post(
    "/:id/render",
    zValidator("json", RenderRequestSchema, (result, c) => {
      if (!result.success) return validationErrorResponse(c, result.error.issues);
    }),
    async (c) => {
      const projectId = c.req.param("id");
      const body = c.req.valid("json");
      const job = enqueueJob(projectId, (ctx) => runRenderPipeline(projectId, body, ctx));
      return c.json(job, 202);
    },
  )

  // Past outputs, newest first, plus whether the current project state would
  // produce something different from the most recent one.
  .get("/:id/renders", async (c) => {
    const projectId = c.req.param("id");
    const project = await getProject(projectId);
    if (!project) throw new NotFoundError(`project ${projectId} not found`);

    const rendersDir = join(projectDir(project.slug), "renders");
    const files = (await dirExists(rendersDir)) ? await readdir(rendersDir) : [];

    const renders = await Promise.all(
      files
        .filter((name) => name.endsWith(".mp4"))
        .map(async (name) => {
          const info = await stat(join(rendersDir, name));
          return {
            filename: name,
            path: `renders/${name}`,
            bytes: info.size,
            createdAt: new Date(info.mtimeMs).toISOString(),
            isLatest: project.lastRender?.path === `renders/${name}`,
          };
        }),
    );
    renders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    // Comparing hashes tells the UI whether pressing render would actually
    // change anything, so the button can say so.
    const { manifest } = await buildRenderManifest(projectId);
    const upToDate = project.lastRender?.manifestHash === manifestHash(manifest);

    return c.json({ renders, upToDate });
  });
