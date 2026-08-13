import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { mixHash, type Project } from "@app/core";
import { NotFoundError } from "../lib/errors.ts";
import { pathExists } from "../lib/fsx.ts";
import type { JobContext } from "../jobs/queue.ts";
import { getProject, projectDir } from "../store/projects.ts";
import { listAssets } from "../store/assets.ts";
import { MASTER_FORMAT, buildConcatenatedVo } from "./audio-concat.ts";
import { runFfmpeg } from "./ffmpeg.ts";

export const MASTER_FILE = "audio/master.wav";

// YouTube normalizes uploads to about -14 LUFS; delivering at that level
// means the platform leaves the audio alone instead of turning it down.
const TARGET_LUFS = -14;
const TRUE_PEAK_DB = -1.5;
const LOUDNESS_RANGE = 11;

/**
 * Builds the single master audio track: voiceover with the music ducked
 * underneath it, normalized for delivery.
 *
 * Remotion only ever receives this one file, never the individual clips —
 * that keeps the render deterministic and means an audio problem can be
 * debugged by playing a wav rather than by re-rendering a video.
 */
export async function buildMasterAudio(
  projectId: string,
  opts: { force?: boolean },
  ctx: JobContext,
): Promise<null> {
  const project = await getProject(projectId);
  if (!project) throw new NotFoundError(`project ${projectId} not found`);

  const dir = projectDir(project.slug);
  const outputPath = join(dir, MASTER_FILE);
  const expectedHash = mixHash(project);
  const stampPath = join(dir, ".cache", "master.hash");

  if (!opts.force && (await pathExists(outputPath)) && (await pathExists(stampPath))) {
    const previous = (await Bun.file(stampPath).text()).trim();
    if (previous === expectedHash) {
      ctx.log("Master audio is already up to date.");
      return null;
    }
  }

  ctx.setStep("mix");
  ctx.setProgress(0.1);
  ctx.log("Concatenating voiceover…");
  const { path: voPath, durationMs } = await buildConcatenatedVo(project, MASTER_FORMAT);
  ctx.throwIfCancelled();

  const bgmPath = await resolveBgmPath(project, dir);
  await mkdir(join(dir, "audio"), { recursive: true });

  ctx.setProgress(0.4);
  if (bgmPath) {
    ctx.log("Mixing music under the voiceover with ducking…");
    await runFfmpeg(buildMixArgs(project, voPath, bgmPath, durationMs, outputPath), "mixing master audio");
  } else {
    ctx.log("No background music selected — normalizing voiceover only.");
    await runFfmpeg(
      [
        "-i",
        voPath,
        "-af",
        loudnormFilter(),
        "-ar",
        String(MASTER_FORMAT.sampleRate),
        "-ac",
        String(MASTER_FORMAT.channels),
        "-c:a",
        "pcm_s16le",
        outputPath,
      ],
      "normalizing master audio",
    );
  }

  await Bun.write(stampPath, expectedHash);
  ctx.setProgress(1);
  ctx.log(`Master audio written (${(durationMs / 1000).toFixed(1)}s, ${TARGET_LUFS} LUFS target).`);
  return null;
}

async function resolveBgmPath(project: Project, dir: string): Promise<string | null> {
  if (!project.bgm.assetId) return null;
  const assets = await listAssets(project.id);
  const asset = assets.find((a) => a.id === project.bgm.assetId);
  if (!asset) return null; // track was deleted; carry on without music
  const path = join(dir, "assets", asset.filename);
  return (await pathExists(path)) ? path : null;
}

function loudnormFilter(): string {
  return `loudnorm=I=${TARGET_LUFS}:TP=${TRUE_PEAK_DB}:LRA=${LOUDNESS_RANGE}`;
}

/**
 * `duckingDb` is how far the music should drop under speech. A compressor
 * expresses that as a ratio rather than a dB figure, so it's converted here:
 * ratio 4 ≈ 12dB of reduction on loud speech, which is the usual default.
 */
function duckingRatio(duckingDb: number): number {
  const magnitude = Math.abs(duckingDb);
  return Math.max(2, Math.min(20, 1 + magnitude / 3));
}

export function buildMixArgs(
  project: Project,
  voPath: string,
  bgmPath: string,
  durationMs: number,
  outputPath: string,
): string[] {
  const { bgm } = project;
  const durationSec = durationMs / 1000;
  const fadeInSec = Math.max(0, bgm.fadeInMs / 1000);
  const fadeOutSec = Math.max(0, bgm.fadeOutMs / 1000);
  const fadeOutStart = Math.max(0, durationSec - fadeOutSec);

  // The voiceover is used twice: once as the sidechain that triggers ducking,
  // once as an actual layer in the mix. asplit is what allows that.
  const filter = [
    `[0:a]asplit=2[vo_mix][vo_key]`,
    [
      `[1:a]volume=${bgm.gainDb}dB`,
      `atrim=0:${durationSec.toFixed(3)}`,
      `asetpts=N/SR/TB`,
      `afade=t=in:st=0:d=${fadeInSec.toFixed(3)}`,
      `afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeOutSec.toFixed(3)}`,
      `aformat=sample_rates=${MASTER_FORMAT.sampleRate}:channel_layouts=stereo[bgm]`,
    ].join(","),
    // main=[bgm] is what gets attenuated; sidechain=[vo_key] is what triggers it.
    `[bgm][vo_key]sidechaincompress=threshold=0.03:ratio=${duckingRatio(bgm.duckingDb).toFixed(2)}:attack=20:release=400:detection=rms[ducked]`,
    `[vo_mix][ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mixed]`,
    `[mixed]${loudnormFilter()}[out]`,
  ].join(";");

  return [
    "-i",
    voPath,
    // Loop the music so a short track still covers a long script; atrim
    // above cuts it back to the voiceover's length.
    "-stream_loop",
    "-1",
    "-i",
    bgmPath,
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-t",
    durationSec.toFixed(3),
    "-ar",
    String(MASTER_FORMAT.sampleRate),
    "-ac",
    String(MASTER_FORMAT.channels),
    "-c:a",
    "pcm_s16le",
    outputPath,
  ];
}
