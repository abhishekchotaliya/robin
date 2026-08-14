import { cp } from "node:fs/promises";
import { join } from "node:path";
import {
  deriveStatus,
  ProjectExportSchema,
  ProjectSchema,
  slugify,
  type Project,
  type ProjectExport,
} from "@app/core";
import { db } from "../db/client.ts";
import { assetToRow, captionsToRow, sceneToRow } from "../db/mappers.ts";
import { assets, captions, projects, scenes } from "../db/schema.ts";
import { ApiHttpError, NotFoundError } from "../lib/errors.ts";
import { pathExists } from "../lib/fsx.ts";
import { assetPath, listAssets } from "./assets.ts";
import { readCaptions } from "./captions.ts";
import { getProject, projectDir, scaffoldProjectDirs, uniqueSlug } from "./projects.ts";

export async function exportProject(projectId: string): Promise<ProjectExport> {
  const project = await getProject(projectId);
  if (!project) throw new NotFoundError(`project ${projectId} not found`);
  const [projectAssets, captionsFile] = await Promise.all([listAssets(projectId), readCaptions(projectId)]);

  return ProjectExportSchema.parse({
    exportedAt: new Date().toISOString(),
    sourceSlug: project.slug,
    project,
    assets: projectAssets,
    captions: captionsFile,
  });
}

export async function importProject(doc: ProjectExport): Promise<Project> {
  const source = doc.project;

  // Media is referenced by the original project's slug, not embedded in the
  // document — fail loudly here if a file is missing rather than importing
  // a project that renders black frames.
  const missing: string[] = [];
  for (const asset of doc.assets) {
    if (!(await pathExists(assetPath(doc.sourceSlug, asset.filename)))) missing.push(asset.filename);
  }
  if (missing.length > 0) {
    throw new ApiHttpError(
      "VALIDATION",
      `import references ${missing.length} asset file(s) missing from ${doc.sourceSlug}/assets: ${missing.join(", ")}`,
      400,
    );
  }

  const newSlug = await uniqueSlug(slugify(source.title));
  const newId = crypto.randomUUID();
  const now = new Date().toISOString();

  await scaffoldProjectDirs(newSlug);
  const srcDir = projectDir(doc.sourceSlug);
  const dstDir = projectDir(newSlug);
  await cp(join(srcDir, "assets"), join(dstDir, "assets"), { recursive: true }).catch(() => {});
  await cp(join(srcDir, "audio"), join(dstDir, "audio"), { recursive: true }).catch(() => {});

  // Asset id is a global primary key, so imported assets need fresh ids —
  // scene.media.assetId / bgm.assetId are remapped through old->new or the
  // import's scenes would reference assets that don't exist under its own
  // project id (same reasoning as duplicateProject).
  const assetIdMap = new Map<string, string>();
  for (const asset of doc.assets) assetIdMap.set(asset.id, crypto.randomUUID());
  const remapAssetId = (assetId: string | null): string | null =>
    assetId ? (assetIdMap.get(assetId) ?? assetId) : assetId;

  const newScenes = source.scenes.map((scene) => ({
    ...scene,
    id: crypto.randomUUID(),
    media: { ...scene.media, assetId: remapAssetId(scene.media.assetId) },
  }));
  const newBgm = source.bgm.assetId ? { ...source.bgm, assetId: remapAssetId(source.bgm.assetId) } : source.bgm;

  const imported: Project = {
    ...source,
    id: newId,
    slug: newSlug,
    createdAt: now,
    updatedAt: now,
    lastRender: null,
    scenes: newScenes,
    bgm: newBgm,
  };
  imported.status = deriveStatus(imported);
  const validated = ProjectSchema.parse(imported);

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
    for (const asset of doc.assets) {
      const newAssetId = assetIdMap.get(asset.id);
      if (!newAssetId) continue;
      await tx.insert(assets).values(assetToRow(validated.id, { ...asset, id: newAssetId }));
    }
    if (doc.captions) {
      await tx.insert(captions).values(captionsToRow(validated.id, doc.captions));
    }
  });

  return validated;
}
