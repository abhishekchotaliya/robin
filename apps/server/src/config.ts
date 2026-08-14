import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";

export const PROJECTS_ROOT = process.env.VIDEO_STUDIO_ROOT ?? join(homedir(), "VideoStudio");
export const PROJECTS_DIR = join(PROJECTS_ROOT, "projects");
export const SETTINGS_FILE = join(PROJECTS_ROOT, "settings.json");
// whisper.cpp build + models: one shared install per machine, not per
// project (the binary and model are hundreds of MB).
export const WHISPER_DIR = join(PROJECTS_ROOT, ".whisper");

export const PORT = 8787;
// Absolute origin the renderer hands to Remotion so the headless browser can
// fetch /files/* — it can't use relative URLs, those would resolve against
// the bundle's own port.
export const API_ORIGIN = `http://localhost:${PORT}`;

export async function ensureProjectsRoot(): Promise<void> {
  await mkdir(PROJECTS_DIR, { recursive: true });
}
