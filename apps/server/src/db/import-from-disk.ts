import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import {
  AssetIndexSchema,
  CaptionsFileSchema,
  ProjectSchema,
  SettingsSchema,
  type Asset,
  type Project,
} from "@app/core";
import { PROJECTS_DIR, SETTINGS_FILE } from "../config.ts";
import { dirExists, pathExists, readJson } from "../lib/fsx.ts";
import { db } from "./client.ts";
import { assetToRow, captionsToRow, sceneToRow, settingsToRow } from "./mappers.ts";
import { assets, captions, projects, scenes, settings } from "./schema.ts";

/**
 * One-time bulk import from the pre-SQLite JSON layout. Only runs when the
 * DB has zero projects — a normal boot against an already-migrated DB is a
 * no-op. Never deletes or modifies the JSON files; each imported project
 * folder gets a `.migrated` marker for auditability, but the marker isn't
 * what gates re-running — the empty-DB check is, so a project added to disk
 * by hand after the first import is not picked up automatically.
 */
export async function importFromDiskIfNeeded(): Promise<void> {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(projects);
  if ((row?.count ?? 0) > 0) return;
  if (!(await dirExists(PROJECTS_DIR))) return;

  await importSettingsIfPresent();

  const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(PROJECTS_DIR, entry.name);
    if (!(await pathExists(join(dir, "project.json")))) continue;
    try {
      await importProjectDir(dir);
    } catch (err) {
      console.error(`[import] failed to import project at ${dir}, skipping:`, err);
    }
  }
}

async function importSettingsIfPresent(): Promise<void> {
  if (!(await pathExists(SETTINGS_FILE))) return;
  const parsed = SettingsSchema.parse(await readJson<unknown>(SETTINGS_FILE));
  await db.insert(settings).values(settingsToRow(parsed)).onConflictDoNothing();
}

async function importProjectDir(dir: string): Promise<void> {
  const project = ProjectSchema.parse(await readJson<unknown>(join(dir, "project.json")));

  let projectAssets: Asset[] = [];
  const assetsFile = join(dir, "assets.json");
  if (await pathExists(assetsFile)) {
    projectAssets = AssetIndexSchema.parse(await readJson<unknown>(assetsFile)).assets;
  }

  let captionsFile: unknown = null;
  const captionsPath = join(dir, "captions", "words.json");
  if (await pathExists(captionsPath)) {
    captionsFile = CaptionsFileSchema.parse(await readJson<unknown>(captionsPath));
  }

  await db.transaction(async (tx) => {
    await insertProject(tx, project);
    for (const asset of projectAssets) {
      await tx.insert(assets).values(assetToRow(project.id, asset));
    }
    if (captionsFile) {
      await tx.insert(captions).values(captionsToRow(project.id, captionsFile as Parameters<typeof captionsToRow>[1]));
    }
  });

  await Bun.write(join(dir, ".migrated"), new Date().toISOString());
}

async function insertProject(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], project: Project): Promise<void> {
  await tx.insert(projects).values({
    id: project.id,
    slug: project.slug,
    title: project.title,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    formatWidth: project.format.width,
    formatHeight: project.format.height,
    formatFps: project.format.fps,
    templateId: project.templateId,
    voice: project.voice,
    bgm: project.bgm,
    captionsConfig: project.captions,
    lastRender: project.lastRender,
  });
  for (const scene of project.scenes) {
    await tx.insert(scenes).values(sceneToRow(project.id, scene));
  }
}
