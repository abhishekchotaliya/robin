import { DEFAULT_SETTINGS, SettingsSchema, type Settings } from "@app/core";
import { PROJECTS_ROOT, SETTINGS_FILE } from "../config.ts";
import { pathExists, readJson, writeJsonAtomic } from "../lib/fsx.ts";

// Internal to the server only — settings.json holds provider API keys and
// must never be sent to the browser as-is (see toPublicSettings in core).
// No HTTP route yet; Phase 1 only needs this to supply createProject's
// defaults. The Settings screen (Phase 9) will read/write it via the API.
export async function getSettings(): Promise<Settings> {
  if (!(await pathExists(SETTINGS_FILE))) {
    const initial: Settings = { projectsRoot: PROJECTS_ROOT, ...DEFAULT_SETTINGS };
    await writeJsonAtomic(SETTINGS_FILE, initial);
    return initial;
  }
  const raw = await readJson<unknown>(SETTINGS_FILE);
  return SettingsSchema.parse(raw);
}
