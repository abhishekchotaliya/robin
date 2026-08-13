const MIN_SCENE_DURATION_MS = 1500;
const DEFAULT_WPM = 150;

// Drives the script-tab live counter and the placeholder timeline before a
// scene has synthesized audio. Once TTS runs, the real audio duration wins
// (see manifest-compile.ts) — this is only ever an estimate.
export function estimateSceneDurationMs(text: string, wpm: number = DEFAULT_WPM): number {
  const wordCount = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
  const ms = (wordCount / wpm) * 60_000;
  return Math.max(MIN_SCENE_DURATION_MS, Math.round(ms));
}
