import {
  DEFAULT_KEN_BURNS,
  FORMAT_PRESETS,
  type FormatPreset,
  type Project,
  type ProjectStatus,
  type Scene,
} from "../schemas/project.ts";
import type { Settings } from "../schemas/settings.ts";
import { hashContent } from "./hash.ts";

// Status is derived, never hand-set — recomputed by the store on every write
// so it can never drift from the data it's supposed to summarize.
//   draft     -> no scenes, or any scene has empty narration text
//   scripted  -> all scenes have narration text
//   voiced    -> scripted AND every scene's audio hash matches its current text/voice
//   ready     -> voiced AND every non-color scene has an assigned asset
//   rendered  -> ready AND lastRender.manifestHash matches the current compiled manifest
export function deriveStatus(project: Project, currentManifestHash?: string): ProjectStatus {
  if (project.scenes.length === 0) return "draft";
  if (project.scenes.some((s) => s.text.trim().length === 0)) return "draft";

  const allVoiced = project.scenes.every((s) => {
    if (!s.audio) return false;
    const expectedHash = sceneAudioHash(s.text, project.voice);
    return s.audio.hash === expectedHash;
  });
  if (!allVoiced) return "scripted";

  const allMediaAssigned = project.scenes.every(
    (s) => s.media.kind === "color" || s.media.assetId !== null,
  );
  if (!allMediaAssigned) return "voiced";

  if (project.lastRender && currentManifestHash && project.lastRender.manifestHash === currentManifestHash) {
    return "rendered";
  }
  return "ready";
}

// The exact hash a scene's audio.hash must match to be considered fresh.
// Shared by deriveStatus (staleness check) and the TTS service (cache key).
export function sceneAudioHash(text: string, voice: Project["voice"]): string {
  return hashContent(text, voice.providerId, voice.voiceId, String(voice.speed), String(voice.stability));
}

export const DEFAULT_SCENE_COLOR = "#18181b";

// Used by createEmptyProject, the "add scene" button, and split-into-scenes.
// One definition of what a new scene is, shared by client and server.
export function createEmptyScene(order: number, text = ""): Scene {
  return {
    id: crypto.randomUUID(),
    order,
    text,
    overlayText: null,
    media: {
      kind: "color",
      assetId: null,
      fit: "cover",
      color: DEFAULT_SCENE_COLOR,
      kenBurns: DEFAULT_KEN_BURNS,
    },
    audio: null,
    transitionOut: { type: "none", durationMs: 0 },
  };
}

export function createEmptyProject(input: {
  title: string;
  slug: string;
  formatPreset: FormatPreset;
  templateId: string;
  defaults: Settings;
}): Project {
  const now = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    slug: input.slug,
    title: input.title,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    format: FORMAT_PRESETS[input.formatPreset],
    templateId: input.templateId,
    voice: input.defaults.defaultVoice,
    bgm: {
      assetId: null,
      gainDb: -18,
      duckingDb: -12,
      fadeInMs: 500,
      fadeOutMs: 500,
    },
    captions: {
      enabled: true,
      style: "bold-center",
      maxWordsPerLine: 4,
    },
    scenes: [createEmptyScene(0)],
    lastRender: null,
  };
}
