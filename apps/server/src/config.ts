import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";

export const PROJECTS_ROOT = process.env.VIDEO_STUDIO_ROOT ?? join(homedir(), "VideoStudio");
export const PROJECTS_DIR = join(PROJECTS_ROOT, "projects");
export const SETTINGS_FILE = join(PROJECTS_ROOT, "settings.json");

export async function ensureProjectsRoot(): Promise<void> {
  await mkdir(PROJECTS_DIR, { recursive: true });
}
