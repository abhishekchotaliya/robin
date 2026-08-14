import { captionsHash, normalizeWords, type CaptionsFile, type ManifestWord } from "@app/core";
import {
  downloadWhisperModel,
  installWhisperCpp,
  transcribe,
  type TranscriptionJson,
} from "@remotion/install-whisper-cpp";
import { WHISPER_DIR } from "../config.ts";
import { NotFoundError } from "../lib/errors.ts";
import type { JobContext } from "../jobs/queue.ts";
import { readCaptions, writeCaptions } from "../store/captions.ts";
import { getProject } from "../store/projects.ts";
import { WHISPER_FORMAT, buildConcatenatedVo } from "./audio-concat.ts";

// Pinned so an upgrade is a deliberate change: whisper.cpp's CLI flags and
// JSON output have shifted between releases.
const WHISPER_VERSION = "1.5.5";
// base.en is the accuracy/speed sweet spot for narration in English and is a
// ~150MB download. large-v3-turbo is better but ~1.5GB.
const WHISPER_MODEL = "base.en";

export { readCaptions };

/**
 * Transcribes the project's voiceover into word-level timestamps.
 *
 * Cached on captionsHash(project) — the hash of every scene's audio plus the
 * gap constant — so re-running after an unrelated edit (media, colours) is a
 * no-op, while changing any narration invalidates it.
 */
export async function generateCaptions(
  projectId: string,
  opts: { force?: boolean },
  ctx: JobContext,
): Promise<null> {
  const project = await getProject(projectId);
  if (!project) throw new NotFoundError(`project ${projectId} not found`);

  const expectedHash = captionsHash(project);

  if (!opts.force) {
    const existing = await readCaptions(projectId);
    if (existing?.hash === expectedHash) {
      ctx.log("Captions are already up to date for this voiceover.");
      return null;
    }
  }

  ctx.setStep("captions");
  ctx.setProgress(0.05);

  // Installed on demand into the projects root (not the repo, not per
  // project): it's a ~150MB model plus a compiled binary shared by every
  // project on this machine.
  // Do NOT pre-create WHISPER_DIR: installWhisperCpp treats an existing
  // folder without the compiled binary as a broken install and refuses to
  // proceed. It creates the folder itself.
  ctx.log("Checking whisper.cpp installation (first run compiles it — this takes a few minutes)…");
  const install = await installWhisperCpp({ to: WHISPER_DIR, version: WHISPER_VERSION });
  ctx.log(install.alreadyExisted ? "whisper.cpp already installed." : "whisper.cpp installed.");
  ctx.throwIfCancelled();

  ctx.setProgress(0.15);
  const model = await downloadWhisperModel({ model: WHISPER_MODEL, folder: WHISPER_DIR });
  ctx.log(model.alreadyExisted ? `Model ${WHISPER_MODEL} already downloaded.` : `Model ${WHISPER_MODEL} downloaded.`);
  ctx.throwIfCancelled();

  ctx.setProgress(0.3);
  ctx.log("Building concatenated voiceover (16kHz mono)…");
  const { path: audioPath } = await buildConcatenatedVo(project, WHISPER_FORMAT);
  ctx.throwIfCancelled();

  ctx.setProgress(0.4);
  ctx.log("Transcribing…");
  const result = await transcribe({
    inputPath: audioPath,
    whisperPath: WHISPER_DIR,
    whisperCppVersion: WHISPER_VERSION,
    model: WHISPER_MODEL,
    modelFolder: WHISPER_DIR,
    tokenLevelTimestamps: true,
    onProgress: (progress) => ctx.setProgress(0.4 + progress * 0.55),
  });

  const words = normalizeWords(extractWords(result));
  ctx.log(`Got ${words.length} word timestamps.`);

  const captions: CaptionsFile = {
    hash: expectedHash,
    model: WHISPER_MODEL,
    createdAt: new Date().toISOString(),
    words,
  };

  await writeCaptions(projectId, captions);

  ctx.setProgress(1);
  ctx.log("Captions complete.");
  return null;
}

/**
 * whisper.cpp returns segments containing token-level entries. Tokens
 * include punctuation-only and special `[_BEG_]`-style markers, which are
 * dropped here so downstream only ever sees real words.
 *
 * Timestamps use `t_dtw` where available — the docs recommend it over
 * `offsets` for accuracy — falling back to the token's own offsets. Values
 * are centiseconds, hence the ×10 into milliseconds.
 */
function extractWords(result: TranscriptionJson<true>): ManifestWord[] {
  const words: ManifestWord[] = [];

  for (const segment of result.transcription) {
    for (const token of segment.tokens) {
      const text = token.text.trim();
      if (text.length === 0) continue;
      if (text.startsWith("[_") || text.startsWith("<|")) continue; // whisper control tokens

      const startMs = token.t_dtw >= 0 ? token.t_dtw * 10 : token.offsets.from;
      const endMs = token.offsets.to;
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;

      words.push({ text, startMs, endMs: Math.max(endMs, startMs) });
    }
  }

  // whisper can emit tokens slightly out of order across segment boundaries.
  return words.sort((a, b) => a.startMs - b.startMs);
}
