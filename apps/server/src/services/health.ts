import { join } from "node:path";
import ffprobe from "@ffprobe-installer/ffprobe";
import type { HealthCheck } from "@app/core";
import { WHISPER_DIR } from "../config.ts";
import { dirExists, pathExists } from "../lib/fsx.ts";
import { FFMPEG_PATH } from "./ffmpeg.ts";

/**
 * Reports whether the native tools the pipeline needs are actually runnable.
 *
 * Each binary is *executed*, not just checked for existence: the failure
 * this catches in practice is a file that exists but won't run — the wrong
 * architecture, or missing its executable bit because a package manager
 * skipped a postinstall. Both produce a confusing mid-render error
 * otherwise. See the native binaries note in CLAUDE.md.
 */
async function checkBinary(name: string, path: string, versionArg = "-version"): Promise<HealthCheck> {
  try {
    const proc = Bun.spawn([path, versionArg], { stdout: "pipe", stderr: "pipe" });
    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    if (exitCode !== 0) {
      return { name, ok: false, detail: `exited with code ${exitCode}`, hint: "Try reinstalling dependencies with `bun install`." };
    }
    return { name, ok: true, detail: stdout.split("\n")[0]?.slice(0, 80) ?? "ok", hint: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      name,
      ok: false,
      detail: message.slice(0, 120),
      hint: message.includes("EACCES")
        ? "The binary is missing its executable bit — add its package to `trustedDependencies` and reinstall."
        : "Run `bun install` to fetch the native binaries.",
    };
  }
}

export async function runHealthChecks(): Promise<HealthCheck[]> {
  const whisperBinary = join(WHISPER_DIR, "main");

  const [ffmpeg, ffprobeCheck] = await Promise.all([
    checkBinary("FFmpeg", FFMPEG_PATH),
    checkBinary("FFprobe", ffprobe.path),
  ]);

  // whisper.cpp is installed on demand by the captions step, so "not yet
  // installed" is a normal state rather than a misconfiguration.
  const whisperInstalled = (await dirExists(WHISPER_DIR)) && (await pathExists(whisperBinary));
  const whisper: HealthCheck = {
    name: "whisper.cpp",
    ok: true,
    detail: whisperInstalled ? "installed" : "not installed yet",
    hint: whisperInstalled ? null : "Installs automatically the first time you transcribe captions.",
  };

  return [ffmpeg, ffprobeCheck, whisper];
}
