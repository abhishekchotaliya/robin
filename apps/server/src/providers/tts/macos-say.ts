import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VoiceOption } from "@app/core";
import { VoiceOptionSchema } from "@app/core";
import { ApiHttpError } from "../../lib/errors.ts";
import { runFfmpeg } from "../../services/ffmpeg.ts";
import type { TTSProvider } from "../types.ts";

// macOS's built-in `say` — zero setup, zero network, zero cost, always
// installed. The free fallback for when a paid provider isn't configured
// yet. Robotic compared to a neural voice, but it never hangs, never bills,
// and never needs an API key.
const DEFAULT_RATE_WPM = 175; // `say`'s own default rate

function parseVoiceLine(line: string): VoiceOption | null {
  // "Name (possibly with spaces)   lang_REGION    # sample text"
  const match = /^(.+?)\s{2,}([a-zA-Z]{2}[_-][a-zA-Z]{2})\s+#\s*(.*)$/.exec(line);
  if (!match) return null;
  const [, name, locale, sample] = match;
  if (!name || !locale) return null;
  return VoiceOptionSchema.parse({
    id: name,
    name: `${name} (${locale})`,
    category: null,
    description: sample || null,
    previewUrl: null,
    labels: { locale },
  });
}

async function listSystemVoices(): Promise<VoiceOption[]> {
  const proc = Bun.spawn(["say", "-v", "?"], { stdout: "pipe", stderr: "pipe" });
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (exitCode !== 0) {
    throw new ApiHttpError("INTERNAL", "Couldn't list macOS system voices (`say -v ?` failed).", 500);
  }
  return stdout
    .split("\n")
    .map(parseVoiceLine)
    .filter((v): v is VoiceOption => v !== null);
}

export const macosSayProvider: TTSProvider = {
  id: "macos-say",
  label: "macOS Say (offline, free)",

  isConfigured() {
    // No account or key — only "is this even macOS" matters.
    return process.platform === "darwin";
  },

  async listVoices(): Promise<VoiceOption[]> {
    if (process.platform !== "darwin") return [];
    return listSystemVoices();
  },

  async synthesize(text, opts, _settings, signal): Promise<ArrayBuffer> {
    if (process.platform !== "darwin") {
      throw new ApiHttpError("VALIDATION", "macOS Say is only available on macOS.", 400);
    }
    if (!opts.voiceId) {
      throw new ApiHttpError("VALIDATION", "No voice selected. Pick one in the Audio tab first.", 400);
    }

    const dir = await mkdtemp(join(tmpdir(), "vs-say-"));
    const aiffPath = join(dir, "out.aiff");
    const mp3Path = join(dir, "out.mp3");
    try {
      const rate = Math.round(DEFAULT_RATE_WPM * opts.speed);
      const proc = Bun.spawn(["say", "-v", opts.voiceId, "-r", String(rate), "-o", aiffPath, text], {
        stdout: "pipe",
        stderr: "pipe",
        signal,
      });
      const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
      if (signal.aborted) {
        throw new ApiHttpError("CONFLICT", "Synthesis timed out or was cancelled.", 409);
      }
      if (exitCode !== 0) {
        throw new ApiHttpError("INTERNAL", `\`say\` failed: ${stderr.trim().slice(0, 300)}`, 500);
      }

      // tts.ts caches every provider's output as .mp3 regardless of engine,
      // so `say`'s native AIFF is transcoded rather than teaching the
      // pipeline a second audio container.
      await runFfmpeg(["-i", aiffPath, "-codec:a", "libmp3lame", "-qscale:a", "2", mp3Path], "converting say output");

      return await Bun.file(mp3Path).arrayBuffer();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
};
