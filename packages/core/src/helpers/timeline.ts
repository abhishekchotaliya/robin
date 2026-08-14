import type { Project, Scene } from "../schemas/project.ts";
import { estimateSceneDurationMs } from "./duration.ts";
import { hashContent } from "./hash.ts";

// Small silence between scene VOs. Three things must agree on this number or
// captions drift out of sync with picture: the compiled manifest's frame
// offsets, the concatenated audio whisper transcribes, and the phase-6 mix.
// They all read it from here.
export const SCENE_GAP_MS = 300;

export interface TimelineEntry {
  sceneId: string;
  startMs: number;
  durationMs: number;
}

export interface Timeline {
  entries: TimelineEntry[];
  totalDurationMs: number;
}

/**
 * The single source of truth for when each scene starts. Scene duration is
 * its voiceover's real length once synthesized, and a word-count estimate
 * before that — never an explicit per-scene duration field.
 */
export function computeSceneTimeline(project: Project): Timeline {
  const ordered = [...project.scenes].sort((a, b) => a.order - b.order);

  const entries: TimelineEntry[] = [];
  let cursorMs = 0;
  for (const scene of ordered) {
    const durationMs = sceneDurationMs(scene);
    entries.push({ sceneId: scene.id, startMs: cursorMs, durationMs });
    cursorMs += durationMs + SCENE_GAP_MS;
  }

  return {
    entries,
    // No trailing gap after the final scene.
    totalDurationMs: entries.length > 0 ? cursorMs - SCENE_GAP_MS : 0,
  };
}

export function sceneDurationMs(scene: Scene): number {
  return scene.audio?.durationMs ?? estimateSceneDurationMs(scene.text);
}

/**
 * Cache key for the captions step. Captions are transcribed from the
 * concatenated voiceover, so they're stale exactly when that concatenation
 * would differ — i.e. when any scene's audio, or the scene order, changes.
 */
export function captionsHash(project: Project): string {
  return hashContent(...voHashes(project), String(SCENE_GAP_MS));
}

/**
 * Cache key for the mixed master audio: the voiceover it's built from plus
 * every setting that changes how the music sits under it. Changing a gain
 * slider must invalidate this; changing a scene's colour must not.
 */
export function mixHash(project: Project): string {
  const { bgm } = project;
  return hashContent(
    ...voHashes(project),
    String(SCENE_GAP_MS),
    bgm.assetId ?? "no-bgm",
    String(bgm.gainDb),
    String(bgm.duckingDb),
    String(bgm.fadeInMs),
    String(bgm.fadeOutMs),
  );
}

function voHashes(project: Project): string[] {
  return [...project.scenes].sort((a, b) => a.order - b.order).map((scene) => scene.audio?.hash ?? "none");
}
