import ffmpegStatic from "ffmpeg-static";
import { ApiHttpError } from "../lib/errors.ts";

// ffmpeg-static downloads a real per-architecture binary at install time
// (verified arm64 on Apple Silicon), unlike ffprobe-static — see the native
// binaries note in CLAUDE.md. Its install script only runs because the
// package is listed in root `trustedDependencies`.
export const FFMPEG_PATH: string = ffmpegStatic ?? "ffmpeg";

/**
 * Grabs a poster frame from a rendered video for the project card.
 *
 * Seeks a little past the start deliberately: scenes fade in from black, so
 * frame 0 is a black rectangle and would make every card look empty.
 */
export async function extractPosterFrame(videoPath: string, outputPath: string): Promise<void> {
  await runFfmpeg(
    ["-ss", "0.5", "-i", videoPath, "-frames:v", "1", "-q:v", "3", outputPath],
    "extracting poster frame",
  );
}

export async function runFfmpeg(args: string[], label: string): Promise<void> {
  const proc = Bun.spawn([FFMPEG_PATH, "-hide_banner", "-loglevel", "error", "-y", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);

  if (exitCode !== 0) {
    throw new ApiHttpError("INTERNAL", `ffmpeg ${label} failed: ${stderr.trim().slice(0, 500)}`, 500);
  }
}
