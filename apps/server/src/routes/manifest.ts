import { join } from "node:path";
import { compileManifest } from "@app/core";
import { Hono } from "hono";
import { NotFoundError } from "../lib/errors.ts";
import { pathExists } from "../lib/fsx.ts";
import { readCaptions } from "../services/captions.ts";
import { MASTER_FILE } from "../services/mix.ts";
import { listAssets } from "../store/assets.ts";
import { getProject, projectDir } from "../store/projects.ts";

// The compiled manifest is what Remotion consumes — never the raw Project.
// pathMode "http" resolves media to /files/... URLs because the Player runs
// in the browser and can't read from disk; the renderer (phase 8) asks for
// "fs" instead.
export const manifestRoutes = new Hono().get("/:id/manifest", async (c) => {
  const projectId = c.req.param("id");
  const project = await getProject(projectId);
  if (!project) throw new NotFoundError(`project ${projectId} not found`);

  const dir = projectDir(project.slug);
  const [assets, captions, masterAudioExists] = await Promise.all([
    listAssets(projectId),
    readCaptions(projectId),
    pathExists(join(dir, MASTER_FILE)),
  ]);

  return c.json(
    compileManifest(project, {
      pathMode: "http",
      projectDir: dir,
      assets,
      words: captions?.words ?? null,
      masterAudioExists,
    }),
  );
});
