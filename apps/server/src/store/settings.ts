import { eq } from "drizzle-orm";
import { DEFAULT_SETTINGS, SettingsSchema, type Settings, type UpdateSettingsRequest } from "@app/core";
import { PROJECTS_ROOT } from "../config.ts";
import { db } from "../db/client.ts";
import { rowToSettings, settingsToRow } from "../db/mappers.ts";
import { settings } from "../db/schema.ts";
import { KeyedMutex } from "../lib/mutex.ts";

const settingsMutex = new KeyedMutex();

export async function getSettings(): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  if (row) return rowToSettings(row);

  const defaults = SettingsSchema.parse({ ...DEFAULT_SETTINGS, projectsRoot: PROJECTS_ROOT });
  await db.insert(settings).values(settingsToRow(defaults));
  return defaults;
}

export async function updateSettings(patch: UpdateSettingsRequest): Promise<Settings> {
  return settingsMutex.run("settings", async () => {
    const current = await getSettings();
    const merged: Settings = {
      ...current,
      ...patch,
      // one level deeper: setting one provider key must not wipe another.
      providers: { ...current.providers, ...patch.providers },
    };
    const validated = SettingsSchema.parse(merged);
    await db.update(settings).set(settingsToRow(validated)).where(eq(settings.id, 1));
    return validated;
  });
}
