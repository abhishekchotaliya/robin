import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { SCENE_GAP_MS, computeSceneTimeline, type Project } from "@app/core";
import { ApiHttpError } from "../lib/errors.ts";
import { pathExists } from "../lib/fsx.ts";
import { projectDir } from "../store/projects.ts";
import { runFfmpeg } from "./ffmpeg.ts";

// whisper.cpp accepts 16-bit 16kHz mono WAV and NOTHING else — hand it an
// mp3 or a 44.1kHz file and it produces silently garbage timestamps rather
// than an error. These constants are the format contract.
const SAMPLE_RATE = 16_000;
const CHANNELS = 1;

/**
 * Builds one WAV of the whole voiceover: every scene's VO in order, with
 * SCENE_GAP_MS of silence between them — the same layout compileManifest
 * uses for frame offsets. Transcribing this exact audio is what makes word
 * timestamps line up with scenes.
 *
 * Written to `.cache/` rather than `audio/` because it's a derived
 * intermediate, not something the user should see or the renderer consumes.
 */
export async function buildConcatenatedVo(project: Project): Promise<{ path: string; durationMs: number }> {
  const dir = projectDir(project.slug);
  const workDir = join(dir, ".cache", "vo-concat");
  const outputPath = join(dir, ".cache", "vo-concat.wav");

  const timeline = computeSceneTimeline(project);
  const ordered = [...project.scenes].sort((a, b) => a.order - b.order).filter((s) => s.audio !== null);
  if (ordered.length === 0) {
    throw new ApiHttpError("VALIDATION", "No voiceover to transcribe — generate audio first.", 400);
  }

  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });

  // Normalize every clip to the same PCM format first, so the concat demuxer
  // can stream-copy them together instead of re-encoding (and so a scene
  // recorded at a different rate can't skew the result).
  const parts: string[] = [];
  for (const [index, scene] of ordered.entries()) {
    const source = join(dir, scene.audio!.file);
    if (!(await pathExists(source))) {
      throw new ApiHttpError(
        "VALIDATION",
        `Scene ${scene.order + 1} references missing audio (${scene.audio!.file}). Regenerate its voiceover.`,
        400,
      );
    }
    const normalized = join(workDir, `scene-${String(index).padStart(3, "0")}.wav`);
    await runFfmpeg(
      ["-i", source, "-ar", String(SAMPLE_RATE), "-ac", String(CHANNELS), "-c:a", "pcm_s16le", normalized],
      `normalizing scene ${scene.order + 1}`,
    );
    parts.push(normalized);
  }

  const silencePath = join(workDir, "gap.wav");
  await runFfmpeg(
    [
      "-f",
      "lavfi",
      "-i",
      `anullsrc=r=${SAMPLE_RATE}:cl=mono`,
      "-t",
      String(SCENE_GAP_MS / 1000),
      "-c:a",
      "pcm_s16le",
      silencePath,
    ],
    "generating gap silence",
  );

  // concat demuxer wants a list file; single quotes are escaped per its
  // syntax, though our paths are uuid/hash-based and won't contain any.
  const listPath = join(workDir, "concat.txt");
  const listLines: string[] = [];
  parts.forEach((part, index) => {
    if (index > 0) listLines.push(`file '${silencePath.replace(/'/g, "'\\''")}'`);
    listLines.push(`file '${part.replace(/'/g, "'\\''")}'`);
  });
  await Bun.write(listPath, `${listLines.join("\n")}\n`);

  await runFfmpeg(["-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outputPath], "concatenating voiceover");

  await rm(workDir, { recursive: true, force: true });

  return { path: outputPath, durationMs: timeline.totalDurationMs };
}
