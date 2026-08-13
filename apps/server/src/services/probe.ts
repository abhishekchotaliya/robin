import ffprobe from "@ffprobe-installer/ffprobe";
import { ApiHttpError } from "../lib/errors.ts";

/**
 * Media duration via ffprobe.
 *
 * Uses @ffprobe-installer/ffprobe, NOT ffprobe-static: the latter ships an
 * x86_64 binary inside its darwin/arm64 folder, so it dies with "bad CPU
 * type" on Apple Silicon unless Rosetta happens to be installed. The
 * installer packages publish a real per-architecture binary each.
 *
 * Their postinstall does `chmod u+x`, which Bun blocks unless the package is
 * listed in root `trustedDependencies` — it is. Without that entry you get a
 * confusing EACCES at runtime rather than a failure at install.
 */
export async function probeDurationMs(filePath: string): Promise<number> {
  const proc = Bun.spawn(
    [
      ffprobe.path,
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new ApiHttpError("INTERNAL", `ffprobe failed for ${filePath}: ${stderr.trim()}`, 500);
  }

  const seconds = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(seconds)) {
    throw new ApiHttpError("INTERNAL", `ffprobe returned no duration for ${filePath}`, 500);
  }
  return Math.round(seconds * 1000);
}
