import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { desc, eq } from "drizzle-orm";
import {
  computeSceneTimeline,
  createEmptyProject,
  deriveStatus,
  ProjectSchema,
  slugify,
  type CreateProjectRequest,
  type Project,
  type ProjectListItem,
  type UpdateProjectRequest,
} from "@app/core";
import { PROJECTS_DIR } from "../config.ts";
import { db } from "../db/client.ts";
import { rowToProject, sceneToRow } from "../db/mappers.ts";
import { assets, captions, projects, scenes } from "../db/schema.ts";
import { NotFoundError } from "../lib/errors.ts";
import { pathExists } from "../lib/fsx.ts";
import { projectMutex } from "../lib/mutex.ts";
import { getSettings } from "./settings.ts";

export function projectDir(slug: string): string {
  return join(PROJECTS_DIR, slug);
}

export async function scaffoldProjectDirs(slug: string): Promise<void> {
  const dir = projectDir(slug);
  await mkdir(join(dir, "assets"), { recursive: true });
  await mkdir(join(dir, "audio", "vo"), { recursive: true });
  await mkdir(join(dir, "renders"), { recursive: true });
  await mkdir(join(dir, ".cache"), { recursive: true });
}

async function getScenesForProject(projectId: string) {
  return db.select().from(scenes).where(eq(scenes.projectId, projectId)).orderBy(scenes.order);
}

/** id -> slug. Was an O(n) scan of every project.json; now a primary-key lookup. */
export async function findProjectSlugById(id: string): Promise<string | null> {
  const [row] = await db.select({ slug: projects.slug }).from(projects).where(eq(projects.id, id)).limit(1);
  return row?.slug ?? null;
}

export async function uniqueSlug(base: string): Promise<string> {
  const taken = new Set((await db.select({ slug: projects.slug }).from(projects)).map((r) => r.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export async function listProjects(): Promise<ProjectListItem[]> {
  const projectRows = await db.select().from(projects).orderBy(desc(projects.updatedAt));
  const items: ProjectListItem[] = [];
  for (const row of projectRows) {
    const sceneRows = await getScenesForProject(row.id);
    const project = rowToProject(row, sceneRows);
    const thumbnailPath = join(projectDir(project.slug), "renders", "thumbnail.jpg");
    const thumbnailUrl = (await pathExists(thumbnailPath)) ? `/files/${project.slug}/renders/thumbnail.jpg` : null;
    items.push({
      id: project.id,
      slug: project.slug,
      title: project.title,
      status: project.status,
      updatedAt: project.updatedAt,
      sceneCount: project.scenes.length,
      estimatedDurationMs: computeSceneTimeline(project).totalDurationMs,
      thumbnailUrl,
    });
  }
  return items;
}

export async function getProject(id: string): Promise<Project | null> {
  const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!row) return null;
  const sceneRows = await getScenesForProject(id);
  return rowToProject(row, sceneRows);
}

export async function createProject(input: CreateProjectRequest): Promise<Project> {
  const slug = await uniqueSlug(slugify(input.title));
  const defaults = await getSettings();
  const project = createEmptyProject({ ...input, slug, defaults });
  await scaffoldProjectDirs(slug);

  await db.transaction(async (tx) => {
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
  });

  return project;
}

export async function updateProject(
  id: string,
  patch: UpdateProjectRequest,
  opts: { currentManifestHash?: string } = {},
): Promise<Project> {
  return projectMutex.run(id, async () => {
    const current = await getProject(id);
    if (!current) throw new NotFoundError(`project ${id} not found`);

    const merged: Project = {
      ...current,
      ...patch,
      id: current.id,
      slug: current.slug,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };
    merged.status = deriveStatus(merged, opts.currentManifestHash);
    const validated = ProjectSchema.parse(merged);

    await db.transaction(async (tx) => {
      await tx
        .update(projects)
        .set({
          title: validated.title,
          status: validated.status,
          updatedAt: validated.updatedAt,
          formatWidth: validated.format.width,
          formatHeight: validated.format.height,
          formatFps: validated.format.fps,
          templateId: validated.templateId,
          voice: validated.voice,
          bgm: validated.bgm,
          captionsConfig: validated.captions,
          lastRender: validated.lastRender,
        })
        .where(eq(projects.id, id));

      // scenes replace wholesale, matching the JSON-store's shallow-merge contract.
      if (patch.scenes !== undefined) {
        await tx.delete(scenes).where(eq(scenes.projectId, id));
        for (const scene of validated.scenes) {
          await tx.insert(scenes).values(sceneToRow(id, scene));
        }
      }
    });

    return validated;
  });
}

export async function duplicateProject(id: string): Promise<Project> {
  const source = await getProject(id);
  if (!source) throw new NotFoundError(`project ${id} not found`);

  const newSlug = await uniqueSlug(slugify(`${source.title} copy`));
  const now = new Date().toISOString();
  const newId = crypto.randomUUID();

  await scaffoldProjectDirs(newSlug);
  const srcDir = projectDir(source.slug);
  const dstDir = projectDir(newSlug);
  await cp(join(srcDir, "assets"), join(dstDir, "assets"), { recursive: true }).catch(() => {});
  await cp(join(srcDir, "audio"), join(dstDir, "audio"), { recursive: true }).catch(() => {});

  // Asset ids are a global primary key (unlike the old per-project assets.json,
  // where ids only had to be unique within one file), so duplicated assets need
  // fresh ids. scene.media.assetId / bgm.assetId reference those ids and must be
  // remapped through the old->new table below, or the copy's scenes would point
  // at assets that don't exist in its own row set.
  const sourceAssets = await db.select().from(assets).where(eq(assets.projectId, id));
  const assetIdMap = new Map<string, string>();
  for (const a of sourceAssets) assetIdMap.set(a.id, crypto.randomUUID());

  const remapAssetId = (assetId: string | null): string | null =>
    assetId ? (assetIdMap.get(assetId) ?? assetId) : assetId;

  const newScenes = source.scenes.map((scene) => ({
    ...scene,
    id: crypto.randomUUID(),
    media: { ...scene.media, assetId: remapAssetId(scene.media.assetId) },
  }));
  const newBgm = source.bgm.assetId
    ? { ...source.bgm, assetId: remapAssetId(source.bgm.assetId) }
    : source.bgm;

  const duplicate: Project = {
    ...source,
    id: newId,
    slug: newSlug,
    title: `${source.title} copy`,
    createdAt: now,
    updatedAt: now,
    lastRender: null,
    scenes: newScenes,
    bgm: newBgm,
  };
  duplicate.status = deriveStatus(duplicate);
  const validated = ProjectSchema.parse(duplicate);

  const [sourceCaptions] = await db.select().from(captions).where(eq(captions.projectId, id));

  await db.transaction(async (tx) => {
    await tx.insert(projects).values({
      id: validated.id,
      slug: validated.slug,
      title: validated.title,
      status: validated.status,
      createdAt: validated.createdAt,
      updatedAt: validated.updatedAt,
      formatWidth: validated.format.width,
      formatHeight: validated.format.height,
      formatFps: validated.format.fps,
      templateId: validated.templateId,
      voice: validated.voice,
      bgm: validated.bgm,
      captionsConfig: validated.captions,
      lastRender: validated.lastRender,
    });
    for (const scene of validated.scenes) {
      await tx.insert(scenes).values(sceneToRow(validated.id, scene));
    }
    for (const a of sourceAssets) {
      const newAssetId = assetIdMap.get(a.id);
      if (!newAssetId) continue;
      await tx.insert(assets).values({ ...a, id: newAssetId, projectId: validated.id });
    }
    if (sourceCaptions) {
      await tx.insert(captions).values({ ...sourceCaptions, projectId: validated.id });
    }
  });

  return validated;
}

export async function deleteProject(id: string): Promise<void> {
  const slug = await findProjectSlugById(id);
  if (!slug) throw new NotFoundError(`project ${id} not found`);
  await db.delete(projects).where(eq(projects.id, id));
  await rm(projectDir(slug), { recursive: true, force: true });
}

/**
 * mixHash stamp for the current audio/master.wav, replacing the old
 * .cache/master.hash file. A narrow single-column read/write — it doesn't
 * go through updateProject because it's not user-facing state and
 * shouldn't bump updatedAt or recompute status.
 */
export async function getMasterHash(id: string): Promise<string | null> {
  const [row] = await db.select({ masterHash: projects.masterHash }).from(projects).where(eq(projects.id, id)).limit(1);
  return row?.masterHash ?? null;
}

export async function setMasterHash(id: string, hash: string): Promise<void> {
  await db.update(projects).set({ masterHash: hash }).where(eq(projects.id, id));
}
