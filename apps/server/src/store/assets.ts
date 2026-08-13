import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  ACCEPTED_MIME_TYPES,
  AssetIndexSchema,
  MAX_UPLOAD_BYTES,
  assetKindFromMime,
  sanitizeFilename,
  type Asset,
} from "@app/core";
import { ApiHttpError, NotFoundError } from "../lib/errors.ts";
import { pathExists, readJson, writeJsonAtomic } from "../lib/fsx.ts";
import { assetMutex } from "../lib/mutex.ts";
import { findProjectSlugById, getProject, projectDir, updateProject } from "./projects.ts";

const ASSETS_FILE = "assets.json";

async function requireProjectSlug(projectId: string): Promise<string> {
  const slug = await findProjectSlugById(projectId);
  if (!slug) throw new NotFoundError(`project ${projectId} not found`);
  return slug;
}

function assetsIndexPath(slug: string): string {
  return join(projectDir(slug), ASSETS_FILE);
}

export function assetPath(slug: string, filename: string): string {
  return join(projectDir(slug), "assets", filename);
}

// A missing or unreadable assets.json means "no assets yet" rather than an
// error — same tolerance as a corrupt project.json in the project list.
async function readIndex(slug: string): Promise<Asset[]> {
  const file = assetsIndexPath(slug);
  if (!(await pathExists(file))) return [];
  try {
    return AssetIndexSchema.parse(await readJson<unknown>(file)).assets;
  } catch (err) {
    console.error(`[store] malformed assets.json at ${file}, treating as empty:`, err);
    return [];
  }
}

async function writeIndex(slug: string, assets: Asset[]): Promise<void> {
  await writeJsonAtomic(assetsIndexPath(slug), { assets });
}

export async function listAssets(projectId: string): Promise<Asset[]> {
  return readIndex(await requireProjectSlug(projectId));
}

export async function addAssets(projectId: string, files: File[]): Promise<Asset[]> {
  const slug = await requireProjectSlug(projectId);

  // Validate everything before writing anything, so a bad file in the batch
  // doesn't leave half an upload on disk.
  for (const file of files) {
    if (!assetKindFromMime(file.type)) {
      throw new ApiHttpError(
        "VALIDATION",
        `unsupported file type "${file.type || "unknown"}" for ${file.name}. Accepted: ${Object.keys(ACCEPTED_MIME_TYPES).join(", ")}`,
        400,
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new ApiHttpError("VALIDATION", `${file.name} exceeds the ${MAX_UPLOAD_BYTES} byte limit`, 400);
    }
  }

  return assetMutex.run(projectId, async () => {
    const existing = await readIndex(slug);
    const created: Asset[] = [];

    for (const file of files) {
      const kind = assetKindFromMime(file.type)!;
      const id = crypto.randomUUID();
      // uuid prefix keeps two uploads of "sunset.jpg" from colliding while
      // leaving the name recognizable in the folder.
      const filename = `${id.slice(0, 8)}-${sanitizeFilename(file.name)}`;
      await Bun.write(assetPath(slug, filename), file);

      created.push({
        id,
        filename,
        kind,
        mime: file.type,
        bytes: file.size,
        // Dimensions and duration are filled in by the probe step (phase 4+),
        // which already shells out to ffprobe for exactly this.
        width: null,
        height: null,
        durationMs: null,
        sourceProvider: "upload",
        sourceMeta: null,
        createdAt: new Date().toISOString(),
      });
    }

    await writeIndex(slug, [...existing, ...created]);
    return created;
  });
}

export async function deleteAsset(projectId: string, assetId: string): Promise<void> {
  const slug = await requireProjectSlug(projectId);

  const asset = await assetMutex.run(projectId, async () => {
    const assets = await readIndex(slug);
    const target = assets.find((a) => a.id === assetId);
    if (!target) throw new NotFoundError(`asset ${assetId} not found`);
    await writeIndex(
      slug,
      assets.filter((a) => a.id !== assetId),
    );
    await rm(assetPath(slug, target.filename), { force: true });
    return target;
  });

  // Clear scene references so no scene points at a file that no longer
  // exists — a dangling assetId would render as a black frame later.
  const project = await getProject(projectId);
  if (!project) return;
  const referencing = project.scenes.filter((s) => s.media.assetId === asset.id);
  if (referencing.length === 0) return;

  await updateProject(projectId, {
    scenes: project.scenes.map((scene) =>
      scene.media.assetId === asset.id
        ? { ...scene, media: { ...scene.media, assetId: null, kind: "color" as const } }
        : scene,
    ),
  });
}
