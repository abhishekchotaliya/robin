import { scenesNeedingAudio } from "@app/core";
import { ApiHttpError, NotFoundError } from "../lib/errors.ts";
import type { JobContext } from "../jobs/queue.ts";
import { getProject } from "../store/projects.ts";
import { synthesizeProjectAudio } from "./tts.ts";
import { generateCaptions } from "./captions.ts";
import { buildMasterAudio } from "./mix.ts";
import { renderProject } from "./renderer.ts";

/**
 * Maps a sub-step's own 0–1 progress into a slice of the overall job, so the
 * user sees one bar that advances monotonically rather than five that each
 * restart at zero.
 */
function scoped(ctx: JobContext, from: number, to: number): JobContext {
  return {
    setStep: ctx.setStep,
    log: ctx.log,
    throwIfCancelled: ctx.throwIfCancelled,
    onCancel: ctx.onCancel,
    setProgress: (progress) => ctx.setProgress(from + Math.max(0, Math.min(1, progress)) * (to - from)),
  };
}

/**
 * The whole thing behind one button: voiceover, captions, mixed audio, video.
 *
 * Every step is content-hash cached and skips itself when nothing it depends
 * on changed, so pressing render after a typo in scene 3 re-synthesizes that
 * one scene and re-renders — it doesn't redo the other five minutes of work.
 */
export async function runRenderPipeline(
  projectId: string,
  opts: { force?: boolean },
  ctx: JobContext,
): Promise<string | null> {
  // `force` re-renders the VIDEO; it deliberately does NOT cascade into the
  // content steps. Forcing TTS would re-synthesize every scene through a
  // paid API when the existing audio is provably current, which is not what
  // someone pressing "render again" is asking for. Re-generating voiceover
  // or captions is an explicit action in the Audio tab.
  // ---- 1. validate -------------------------------------------------------
  ctx.setStep("validate");
  const project = await getProject(projectId);
  if (!project) throw new NotFoundError(`project ${projectId} not found`);

  const scenesWithText = project.scenes.filter((s) => s.text.trim().length > 0);
  if (scenesWithText.length === 0) {
    throw new ApiHttpError("VALIDATION", "Write some narration before rendering.", 400);
  }
  ctx.setProgress(0.02);
  ctx.throwIfCancelled();

  // ---- 2. voiceover (+ probe) -------------------------------------------
  // No API-key pre-check here on purpose: a scene can look stale in
  // project.json while its audio is already cached on disk from an earlier
  // run, and only the TTS service knows that. It skips cached scenes and
  // raises its own actionable error if it genuinely has to call the API
  // without a key.
  if (scenesNeedingAudio(project).length > 0) {
    await synthesizeProjectAudio(projectId, {}, scoped(ctx, 0.02, 0.4));
  } else {
    ctx.log("Voiceover already up to date.");
    ctx.setProgress(0.4);
  }
  ctx.throwIfCancelled();

  // ---- 3. captions -------------------------------------------------------
  if (project.captions.enabled) {
    await generateCaptions(projectId, {}, scoped(ctx, 0.4, 0.6));
  } else {
    ctx.log("Captions are turned off — skipping transcription.");
    ctx.setProgress(0.6);
  }
  ctx.throwIfCancelled();

  // ---- 4. mixed master audio --------------------------------------------
  await buildMasterAudio(projectId, {}, scoped(ctx, 0.6, 0.72));
  ctx.throwIfCancelled();

  // ---- 5. video ----------------------------------------------------------
  const outputPath = await renderProject(projectId, { force: opts.force }, scoped(ctx, 0.72, 1));

  ctx.setProgress(1);
  return outputPath;
}
