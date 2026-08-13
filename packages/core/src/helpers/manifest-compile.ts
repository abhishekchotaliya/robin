import type { Asset } from "../schemas/asset.ts";
import type { ManifestCaptionLine, ManifestScene, ManifestWord, RenderManifest } from "../schemas/manifest.ts";
import type { Project } from "../schemas/project.ts";
import { estimateSceneDurationMs } from "./duration.ts";

// Small silence between scene VOs, baked in at both mix time (ffmpeg, Phase
// 6) and here (timeline math) — they must agree or captions drift out of
// sync with picture.
export const SCENE_GAP_MS = 300;

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
function groupWordsIntoLines(words: ManifestWord[], maxWordsPerLine: number): ManifestCaptionLine[] {
  const perLine = Math.max(1, maxWordsPerLine);
  const lines: ManifestCaptionLine[] = [];
  for (let i = 0; i < words.length; i += perLine) {
    const chunk = words.slice(i, i + perLine);
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    if (!first || !last) continue;
    lines.push({ words: chunk, startMs: first.startMs, endMs: last.endMs });
  }
  return lines;
}

export function compileManifest(project: Project, opts: CompileManifestOptions): RenderManifest {
  const assetsById = new Map(opts.assets.map((a) => [a.id, a]));
  const fps = project.format.fps;
  const orderedScenes = [...project.scenes].sort((a, b) => a.order - b.order);

  const scenes: ManifestScene[] = [];
  let cursorMs = 0;
  for (const scene of orderedScenes) {
    const durationMs = scene.audio?.durationMs ?? estimateSceneDurationMs(scene.text);
    const src =
      scene.media.kind === "color" ? null : resolveMediaSrc(scene.media.assetId, assetsById, project, opts);

    scenes.push({
      id: scene.id,
      from: msToFrames(cursorMs, fps),
      durationInFrames: Math.max(1, msToFrames(durationMs, fps)),
      media: {
        kind: scene.media.kind,
        src,
        fit: scene.media.fit,
        color: scene.media.color,
        kenBurns: scene.media.kenBurns,
      },
      overlayText: scene.overlayText,
    });

    cursorMs += durationMs + SCENE_GAP_MS;
  }
  const totalDurationMs = orderedScenes.length > 0 ? cursorMs - SCENE_GAP_MS : 0;

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
      lines: opts.words ? groupWordsIntoLines(opts.words, project.captions.maxWordsPerLine) : [],
    },
  };
}
