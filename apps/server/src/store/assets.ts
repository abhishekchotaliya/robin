import { rm } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { MAX_UPLOAD_BYTES, assetKindFromMime, sanitizeFilename, type Asset } from "@app/core";
import { db } from "../db/client.ts";
import { assetToRow, rowToAsset } from "../db/mappers.ts";
import { assets } from "../db/schema.ts";
import { ApiHttpError, NotFoundError } from "../lib/errors.ts";
import { assetMutex } from "../lib/mutex.ts";
import { findProjectSlugById, getProject, projectDir, updateProject } from "./projects.ts";

async function requireProjectSlug(projectId: string): Promise<string> {
  const slug = await findProjectSlugById(projectId);
  if (!slug) throw new NotFoundError(`project ${projectId} not found`);
  return slug;
}

export function assetPath(slug: string, filename: string): string {
  return join(projectDir(slug), "assets", filename);
}

export async function listAssets(projectId: string): Promise<Asset[]> {
  const rows = await db.select().from(assets).where(eq(assets.projectId, projectId));
  return rows.map(rowToAsset);
}

export async function addAssets(projectId: string, files: File[]): Promise<Asset[]> {
  const slug = await requireProjectSlug(projectId);

  // Validate the whole batch before writing anything, so a bad file in the
  // middle can't leave a half-finished upload on disk.
  for (const file of files) {
    if (!assetKindFromMime(file.type)) {
      throw new ApiHttpError("VALIDATION", `unsupported file type: ${file.type || "unknown"}`, 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ApiHttpError("VALIDATION", `${file.name} exceeds the ${MAX_UPLOAD_BYTES} byte upload limit`, 400);
    }
  }

  return assetMutex.run(projectId, async () => {
    const created: Asset[] = [];
    const rows: (typeof assets.$inferInsert)[] = [];

    for (const file of files) {
      const kind = assetKindFromMime(file.type);
      if (!kind) continue; // already validated above; narrows for TS
      const id = crypto.randomUUID();
      const filename = `${id.slice(0, 8)}-${sanitizeFilename(file.name)}`;
      await Bun.write(assetPath(slug, filename), file);

      const asset: Asset = {
        id,
        filename,
        kind,
        mime: file.type,
        bytes: file.size,
        width: null,
        height: null,
        durationMs: null,
        sourceProvider: "upload",
        sourceMeta: null,
        createdAt: new Date().toISOString(),
      };
      created.push(asset);
      rows.push(assetToRow(projectId, asset));
    }

    await db.transaction(async (tx) => {
      for (const row of rows) await tx.insert(assets).values(row);
    });

    return created;
  });
}

export async function deleteAsset(projectId: string, assetId: string): Promise<void> {
  const slug = await requireProjectSlug(projectId);

  const target = await assetMutex.run(projectId, async () => {
    const [row] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
    if (!row || row.projectId !== projectId) throw new NotFoundError(`asset ${assetId} not found`);
    await db.delete(assets).where(eq(assets.id, assetId));
    await rm(assetPath(slug, row.filename), { force: true });
    return rowToAsset(row);
  });

  // Clear scene references so no scene points at a file that no longer
  // exists — a dangling assetId would render as a black frame later.
  // updateProject uses projectMutex, a separate instance from assetMutex —
  // nesting the same mutex on itself here would deadlock waiting on its own tail.
  const project = await getProject(projectId);
  if (!project) return;
  const referencing = project.scenes.filter((s) => s.media.assetId === target.id);
  if (referencing.length === 0) return;

  await updateProject(projectId, {
    scenes: project.scenes.map((scene) =>
      scene.media.assetId === target.id
        ? { ...scene, media: { ...scene.media, assetId: null, kind: "color" as const } }
        : scene,
    ),
  });
}
