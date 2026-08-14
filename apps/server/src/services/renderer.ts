import { cpus } from "node:os";
import { mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileManifest, manifestHash, type Project, type RenderManifest } from "@app/core";
import { bundle } from "@remotion/bundler";
import { makeCancelSignal, renderMedia, selectComposition } from "@remotion/renderer";
import { API_ORIGIN } from "../config.ts";
import { ApiHttpError, NotFoundError } from "../lib/errors.ts";
import { pathExists } from "../lib/fsx.ts";
import type { JobContext } from "../jobs/queue.ts";
import { readCaptions } from "./captions.ts";
import { extractPosterFrame } from "./ffmpeg.ts";
import { MASTER_FILE } from "./mix.ts";
import { listAssets } from "../store/assets.ts";
import { getProject, projectDir, updateProject } from "../store/projects.ts";

const COMPOSITION_ID = "ShortsBasic";

// Referenced by the projects list as the card thumbnail.
export const THUMBNAIL_FILE = "thumbnail.jpg";

// packages/video's registerRoot entry, resolved relative to this file so it
// works regardless of the process's cwd.
const VIDEO_ENTRY = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../packages/video/src/index.ts",
);

/**
 * Bundling is slow and only changes when the composition source does, so the
 * result is cached per project in .cache/bundle and reused until any file
 * under packages/video/src is newer than it.
 */
async function getBundle(project: Project, ctx: JobContext): Promise<string> {
  const cacheDir = join(projectDir(project.slug), ".cache", "bundle");
  const stampPath = join(projectDir(project.slug), ".cache", "bundle.stamp");
  const newestSource = await newestSourceMtime(dirname(VIDEO_ENTRY));

  if (await pathExists(stampPath)) {
    const stamp = Number((await Bun.file(stampPath).text()).trim());
    if (Number.isFinite(stamp) && stamp >= newestSource && (await pathExists(join(cacheDir, "index.html")))) {
      ctx.log("Reusing cached composition bundle.");
      return cacheDir;
    }
  }

  ctx.log("Bundling composition (first render after a code change is slower)…");
  const result = await bundle({
    entryPoint: VIDEO_ENTRY,
    outDir: cacheDir,
    onProgress: (percent) => ctx.setProgress(percent / 100),
  });
  await Bun.write(stampPath, String(newestSource));
  return result;
}

async function newestSourceMtime(dir: string): Promise<number> {
  let newest = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, await newestSourceMtime(full));
    } else {
      newest = Math.max(newest, (await stat(full)).mtimeMs);
    }
  }
  return newest;
}

export async function buildRenderManifest(projectId: string): Promise<{
  project: Project;
  manifest: RenderManifest;
}> {
  const project = await getProject(projectId);
  if (!project) throw new NotFoundError(`project ${projectId} not found`);

  const dir = projectDir(project.slug);
  const [assets, captions, masterAudioExists] = await Promise.all([
    listAssets(projectId),
    readCaptions(projectId),
    pathExists(join(dir, MASTER_FILE)),
  ]);

  // http with an absolute origin, NOT fs paths: Remotion serves the bundle
  // from its own localhost port and the headless browser fetches media over
  // HTTP. Absolute file paths would resolve against the bundle's origin, and
  // file:// subresources are blocked from an http:// page.
  const manifest = compileManifest(project, {
    pathMode: "http",
    baseUrl: API_ORIGIN,
    projectDir: dir,
    assets,
    words: captions?.words ?? null,
    masterAudioExists,
  });

  return { project, manifest };
}

export async function renderProject(
  projectId: string,
  opts: { force?: boolean },
  ctx: JobContext,
): Promise<string | null> {
  const { project, manifest } = await buildRenderManifest(projectId);

  if (manifest.scenes.length === 0 || manifest.durationInFrames < 1) {
    throw new ApiHttpError("VALIDATION", "Nothing to render — add a scene with narration first.", 400);
  }

  const hash = manifestHash(manifest);
  if (!opts.force && project.lastRender?.manifestHash === hash) {
    const existing = join(projectDir(project.slug), project.lastRender.path);
    if (await pathExists(existing)) {
      ctx.log("Nothing changed since the last render — keeping the existing video.");
      return project.lastRender.path;
    }
  }

  ctx.setStep("render");
  const serveUrl = await getBundle(project, ctx);
  ctx.throwIfCancelled();

  // Unlike renderMedia, selectComposition takes no cancelSignal — this
  // timeout is the only thing standing between a wedged headless Chromium
  // (seen in practice: launches fine, sits at 0% CPU, no error) and a job
  // stuck at 0% forever with the Cancel button doing nothing.
  const composition = await selectComposition({
    serveUrl,
    id: COMPOSITION_ID,
    inputProps: { manifest },
    timeoutInMilliseconds: 30_000,
  });

  const rendersDir = join(projectDir(project.slug), "renders");
  await mkdir(rendersDir, { recursive: true });
  const filename = `${new Date().toISOString().replace(/[:.]/g, "-")}.mp4`;
  const relativePath = `renders/${filename}`;
  const outputLocation = join(rendersDir, filename);

  ctx.log(`Rendering ${manifest.durationInFrames} frames at ${manifest.fps}fps…`);
  const startedAt = Date.now();

  // renderMedia runs for minutes in one call, so a between-steps checkpoint
  // can't interrupt it — hand Remotion a signal the job can trip directly.
  const { cancelSignal, cancel } = makeCancelSignal();
  ctx.onCancel(cancel);

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation,
    inputProps: { manifest },
    // Half the cores: leaves the machine usable and avoids thrashing when
    // several Chromium instances each want memory.
    concurrency: Math.max(1, Math.floor(cpus().length / 2)),
    onProgress: ({ progress }) => ctx.setProgress(progress),
    cancelSignal,
  });

  const durationMs = Date.now() - startedAt;
  ctx.log(`Rendered in ${(durationMs / 1000).toFixed(1)}s → ${relativePath}`);

  // Poster frame for the project card. A failure here must not fail the
  // render — the video is already on disk and is what the user asked for.
  try {
    await extractPosterFrame(outputLocation, join(rendersDir, THUMBNAIL_FILE));
  } catch (err) {
    console.error("[renderer] could not extract a poster frame:", err);
  }

  // Recording the hash is what lets an unchanged re-render short-circuit and
  // what flips the project's derived status to "rendered".
  await updateProject(
    projectId,
    {
      lastRender: {
        path: relativePath,
        renderedAt: new Date().toISOString(),
        durationMs: Math.round((manifest.durationInFrames / manifest.fps) * 1000),
        manifestHash: hash,
      },
    },
    { currentManifestHash: hash },
  );

  return relativePath;
}
