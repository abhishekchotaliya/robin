import {
  DEFAULT_SETTINGS,
  SettingsSchema,
  type Settings,
  type UpdateSettingsRequest,
} from "@app/core";
import { PROJECTS_ROOT, SETTINGS_FILE } from "../config.ts";
import { pathExists, readJson, writeJsonAtomic } from "../lib/fsx.ts";
import { KeyedMutex } from "../lib/mutex.ts";

const settingsMutex = new KeyedMutex();

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

// Shallow merge, same rule as project PATCH. `providers` is merged one level
// deeper so setting one provider's key can't wipe another's.
export async function updateSettings(patch: UpdateSettingsRequest): Promise<Settings> {
  return settingsMutex.run("settings", async () => {
    const current = await getSettings();
    const merged: Settings = {
      ...current,
      ...patch,
      providers: { ...current.providers, ...patch.providers },
    };
    const validated = SettingsSchema.parse(merged);
    await writeJsonAtomic(SETTINGS_FILE, validated);
    return validated;
  });
}
