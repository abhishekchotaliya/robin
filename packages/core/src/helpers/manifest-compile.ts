import type { Asset } from "../schemas/asset.ts";
import type { ManifestCaptionLine, ManifestScene, ManifestWord, RenderManifest } from "../schemas/manifest.ts";
import type { Project } from "../schemas/project.ts";
import { computeSceneTimeline, type Timeline } from "./timeline.ts";

export interface CompileManifestOptions {
  /** "http" for the browser Player (needs /files/* URLs); "fs" for renderMedia (needs absolute paths). */
  pathMode: "http" | "fs";
  /** Absolute path to this project's directory on disk. Only used in "fs" mode. */
  projectDir: string;
  assets: Asset[];
  /** Whisper word timestamps, or null before Phase 5 has run for this project. */
  words: ManifestWord[] | null;
  /** Whether audio/master.wav exists on disk yet (Phase 6 output). */
  masterAudioExists: boolean;
}

function msToFrames(ms: number, fps: number): number {
  return Math.max(0, Math.round((ms / 1000) * fps));
}

function resolveMediaSrc(
  assetId: string | null,
  assetsById: Map<string, Asset>,
  project: Project,
  opts: CompileManifestOptions,
): string | null {
  if (assetId === null) return null;
  const asset = assetsById.get(assetId);
  if (!asset) return null; // referenced asset was deleted; caller falls back to scene.media.color
  return opts.pathMode === "http"
    ? `/files/${project.slug}/assets/${asset.filename}`
    : `${opts.projectDir}/assets/${asset.filename}`;
}

function resolveAudioSrc(project: Project, opts: CompileManifestOptions): string | null {
  if (!opts.masterAudioExists) return null;
  return opts.pathMode === "http"
    ? `/files/${project.slug}/audio/master.wav`
    : `${opts.projectDir}/audio/master.wav`;
}

// Groups words into caption lines up front so the Remotion component never
// has to do this per-frame (that's a real performance trap at 30fps).
export function groupWordsIntoLines(
  words: ManifestWord[],
  maxWordsPerLine: number,
  timeline: Timeline,
): ManifestCaptionLine[] {
  const perLine = Math.max(1, maxWordsPerLine);
  const lines: ManifestCaptionLine[] = [];

  // Lines must not straddle a scene cut: a line that did would hold the
  // previous scene's words on screen over the next scene's picture.
  for (const group of splitByScene(words, timeline)) {
    for (let i = 0; i < group.length; i += perLine) {
      const chunk = group.slice(i, i + perLine);
      const first = chunk[0];
      const last = chunk[chunk.length - 1];
      if (!first || !last) continue;
      lines.push({ words: chunk, startMs: first.startMs, endMs: last.endMs });
    }
  }

  return lines;
}

/**
 * Buckets words by the scene playing when each one starts. Words landing in
 * the silence between scenes belong to the scene that just ended — that's
 * where the speech they trail from came from.
 */
function splitByScene(words: ManifestWord[], timeline: Timeline): ManifestWord[][] {
  if (timeline.entries.length === 0) return words.length > 0 ? [words] : [];

  const groups = new Map<string, ManifestWord[]>();
  for (const word of words) {
    let owner = timeline.entries[0]!;
    for (const entry of timeline.entries) {
      if (word.startMs >= entry.startMs) owner = entry;
      else break;
    }
    const bucket = groups.get(owner.sceneId) ?? [];
    bucket.push(word);
    groups.set(owner.sceneId, bucket);
  }

  return timeline.entries.map((entry) => groups.get(entry.sceneId) ?? []).filter((g) => g.length > 0);
}

export function compileManifest(project: Project, opts: CompileManifestOptions): RenderManifest {
  const assetsById = new Map(opts.assets.map((a) => [a.id, a]));
  const fps = project.format.fps;
  const scenesById = new Map(project.scenes.map((s) => [s.id, s]));

  // Offsets come from the shared timeline helper, not local arithmetic — the
  // captions step transcribes audio built from these same numbers.
  const timeline = computeSceneTimeline(project);

  const scenes: ManifestScene[] = [];
  for (const entry of timeline.entries) {
    const scene = scenesById.get(entry.sceneId);
    if (!scene) continue;
    const src =
      scene.media.kind === "color" ? null : resolveMediaSrc(scene.media.assetId, assetsById, project, opts);

    scenes.push({
      id: scene.id,
      from: msToFrames(entry.startMs, fps),
      durationInFrames: Math.max(1, msToFrames(entry.durationMs, fps)),
      media: {
        kind: scene.media.kind,
        src,
        fit: scene.media.fit,
        color: scene.media.color,
        kenBurns: scene.media.kenBurns,
      },
      overlayText: scene.overlayText,
    });
  }
  const totalDurationMs = timeline.totalDurationMs;

  return {
    width: project.format.width,
    height: project.format.height,
    fps,
    durationInFrames: msToFrames(totalDurationMs, fps),
    scenes,
    audioSrc: resolveAudioSrc(project, opts),
    captions: {
      enabled: project.captions.enabled,
      style: project.captions.style,
      lines: opts.words ? groupWordsIntoLines(opts.words, project.captions.maxWordsPerLine, timeline) : [],
    },
  };
}
