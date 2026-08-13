import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { isSceneAudioStale, sceneAudioHash, type Project, type Scene } from "@app/core";
import { NotFoundError } from "../lib/errors.ts";
import { pathExists } from "../lib/fsx.ts";
import type { JobContext } from "../jobs/queue.ts";
import { getTTSProvider } from "../providers/registry.ts";
import { getProject, projectDir, updateProject } from "../store/projects.ts";
import { getSettings } from "../store/settings.ts";
import { probeDurationMs } from "./probe.ts";

/**
 * Synthesizes voiceover for the scenes that need it.
 *
 * Cache key is hash(text, voiceId, speed, stability) — the same hash
 * deriveStatus uses to decide whether a scene is voiced. A scene whose hash
 * already matches an existing file is skipped entirely, so fixing a typo in
 * scene 3 re-synthesizes scene 3 and nothing else.
 */
export async function synthesizeProjectAudio(
  projectId: string,
  opts: { sceneIds?: string[]; force?: boolean },
  ctx: JobContext,
): Promise<null> {
  const project = await getProject(projectId);
  if (!project) throw new NotFoundError(`project ${projectId} not found`);

  const settings = await getSettings();
  const provider = getTTSProvider(project.voice.providerId);
  const voDir = join(projectDir(project.slug), "audio", "vo");
  await mkdir(voDir, { recursive: true });

  const targets = selectScenes(project, opts);
  if (targets.length === 0) {
    ctx.log("Every scene already has up-to-date voiceover — nothing to do.");
    return null;
  }

  ctx.setStep("tts");
  ctx.log(`Synthesizing ${targets.length} scene${targets.length === 1 ? "" : "s"} with ${provider.label}.`);

  // Accumulate audio updates and write project.json once at the end rather
  // than per scene: fewer atomic writes, and a cancel midway leaves the
  // already-generated files on disk for the next run's cache to pick up.
  const audioBySceneId = new Map<string, Scene["audio"]>();

  for (const [index, scene] of targets.entries()) {
    ctx.throwIfCancelled();

    const hash = sceneAudioHash(scene.text, project.voice);
    const relativePath = `audio/vo/${hash}.mp3`;
    const absolutePath = join(projectDir(project.slug), relativePath);

    if (!opts.force && (await pathExists(absolutePath))) {
      ctx.log(`Scene ${scene.order + 1}: reusing cached audio (${hash}).`);
    } else {
      ctx.log(`Scene ${scene.order + 1}: generating…`);
      const audio = await provider.synthesize(
        scene.text,
        {
          voiceId: project.voice.voiceId,
          speed: project.voice.speed,
          stability: project.voice.stability,
        },
        settings,
      );
      await Bun.write(absolutePath, audio);
    }

    const durationMs = await probeDurationMs(absolutePath);
    audioBySceneId.set(scene.id, { file: relativePath, durationMs, hash });
    ctx.setProgress((index + 1) / targets.length);
  }

  // Re-read: the user may have kept editing while this ran, and their newer
  // text must win over our stale copy. Scenes whose text changed since we
  // synthesized are left alone — they'll be picked up as stale next run.
  const latest = await getProject(projectId);
  if (!latest) throw new NotFoundError(`project ${projectId} not found`);

  await updateProject(projectId, {
    scenes: latest.scenes.map((scene) => {
      const audio = audioBySceneId.get(scene.id);
      if (!audio) return scene;
      if (sceneAudioHash(scene.text, latest.voice) !== audio.hash) return scene;
      return { ...scene, audio };
    }),
  });

  ctx.log("Voiceover complete.");
  return null;
}

function selectScenes(project: Project, opts: { sceneIds?: string[]; force?: boolean }): Scene[] {
  const requested = opts.sceneIds
    ? project.scenes.filter((s) => opts.sceneIds!.includes(s.id))
    : project.scenes;

  // An explicit scene selection still skips empty scenes (nothing to say),
  // but `force` overrides the freshness check.
  return requested.filter((scene) => {
    if (scene.text.trim().length === 0) return false;
    return opts.force ? true : isSceneAudioStale(scene, project.voice);
  });
}
