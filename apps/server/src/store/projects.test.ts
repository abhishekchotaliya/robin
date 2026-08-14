import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createEmptyScene, type Asset } from "@app/core";

// db/client.ts opens its SQLite connection at module-evaluation time, and
// config.ts reads VIDEO_STUDIO_ROOT at module-evaluation time too — both env
// vars must be set *before* either module (or anything that imports them,
// i.e. every store module) is first evaluated. Static imports are hoisted
// above this file's own code, so the override has to happen before a
// dynamic import pulls those modules in for the first time.
let tmpRoot: string;
let projectsMod: typeof import("./projects.ts");
let assetsMod: typeof import("./assets.ts");
let dbMod: typeof import("../db/client.ts");
let schemaMod: typeof import("../db/schema.ts");

beforeAll(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), "vs-store-test-"));
  process.env.VIDEO_STUDIO_ROOT = tmpRoot;
  process.env.STUDIO_DB_FILE = ":memory:";

  dbMod = await import("../db/client.ts");
  dbMod.runMigrations();
  schemaMod = await import("../db/schema.ts");
  projectsMod = await import("./projects.ts");
  assetsMod = await import("./assets.ts");
});

afterAll(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

function newProjectInput(title: string) {
  return {
    title,
    formatPreset: "shorts" as const,
    resolution: "1080p" as const,
    fps: 30 as const,
    templateId: "shorts-basic",
  };
}

describe("createProject / getProject", () => {
  test("round-trips through the DB", async () => {
    const created = await projectsMod.createProject(newProjectInput("Round Trip"));
    expect(created.status).toBe("draft");
    expect(created.scenes).toHaveLength(1);

    const fetched = await projectsMod.getProject(created.id);
    expect(fetched).toEqual(created);
  });

  test("getProject returns null for an unknown id", async () => {
    expect(await projectsMod.getProject(crypto.randomUUID())).toBeNull();
  });
});

describe("updateProject", () => {
  test("shallow-merges and replaces scenes wholesale, recomputing status", async () => {
    const project = await projectsMod.createProject(newProjectInput("Update Me"));

    const scenes = [createEmptyScene(0, "First scene has narration.")];
    const updated = await projectsMod.updateProject(project.id, { title: "Updated Title", scenes });

    expect(updated.title).toBe("Updated Title");
    expect(updated.scenes).toHaveLength(1);
    expect(updated.scenes[0]?.text).toBe("First scene has narration.");
    // every scene has text -> status derives to "scripted"
    expect(updated.status).toBe("scripted");

    const refetched = await projectsMod.getProject(project.id);
    expect(refetched?.scenes).toHaveLength(1);
    expect(refetched?.status).toBe("scripted");
  });

  test("throws NotFoundError for an unknown project", async () => {
    await expect(projectsMod.updateProject(crypto.randomUUID(), { title: "x" })).rejects.toThrow();
  });
});

describe("duplicateProject", () => {
  test("copies scenes and assets (remapping asset ids) but not renders", async () => {
    const source = await projectsMod.createProject(newProjectInput("Has Asset"));

    // Write a real file so duplicateProject's directory copy has something
    // to find, then register it directly in the assets table (bypassing
    // addAssets' MIME validation, which isn't what this test is about).
    const assetId = crypto.randomUUID();
    const filename = `${assetId.slice(0, 8)}-photo.png`;
    await Bun.write(assetsMod.assetPath(source.slug, filename), "fake-png-bytes");
    const asset: Asset = {
      id: assetId,
      filename,
      kind: "image",
      mime: "image/png",
      bytes: 14,
      width: 100,
      height: 100,
      durationMs: null,
      sourceProvider: "upload",
      sourceMeta: null,
      createdAt: new Date().toISOString(),
    };
    await dbMod.db.insert(schemaMod.assets).values({ ...asset, projectId: source.id });

    const scene = createEmptyScene(0, "Scene with a picture.");
    scene.media = { ...scene.media, kind: "image", assetId };
    await projectsMod.updateProject(source.id, { scenes: [scene] });

    const duplicate = await projectsMod.duplicateProject(source.id);

    expect(duplicate.id).not.toBe(source.id);
    expect(duplicate.slug).not.toBe(source.slug);
    expect(duplicate.scenes).toHaveLength(1);

    const dupAssetId = duplicate.scenes[0]?.media.assetId;
    if (!dupAssetId) throw new Error("expected duplicated scene to keep an assetId");
    expect(dupAssetId).not.toBe(assetId); // asset ids are a global PK, must be remapped

    const dupAssets = await assetsMod.listAssets(duplicate.id);
    expect(dupAssets).toHaveLength(1);
    expect(dupAssets[0]?.id).toBe(dupAssetId);
    expect(dupAssets[0]?.filename).toBe(filename); // same filename, copied file

    const copiedFile = Bun.file(assetsMod.assetPath(duplicate.slug, filename));
    expect(await copiedFile.exists()).toBe(true);

    expect(duplicate.lastRender).toBeNull();
    const rendersDir = join(projectsMod.projectDir(duplicate.slug), "renders");
    const entries = await Array.fromAsync(new Bun.Glob("*").scan({ cwd: rendersDir }));
    expect(entries).toHaveLength(0);
  });
});

describe("deleteProject", () => {
  test("cascade-deletes scenes and assets", async () => {
    const project = await projectsMod.createProject(newProjectInput("Delete Me"));
    const assetId = crypto.randomUUID();
    await dbMod.db.insert(schemaMod.assets).values({
      id: assetId,
      projectId: project.id,
      filename: "x.png",
      kind: "image",
      mime: "image/png",
      bytes: 1,
      width: null,
      height: null,
      durationMs: null,
      sourceProvider: "upload",
      sourceMeta: null,
      createdAt: new Date().toISOString(),
    });

    await projectsMod.deleteProject(project.id);

    expect(await projectsMod.getProject(project.id)).toBeNull();
    const { eq } = await import("drizzle-orm");
    const remainingScenes = await dbMod.db
      .select()
      .from(schemaMod.scenes)
      .where(eq(schemaMod.scenes.projectId, project.id));
    const remainingAssets = await dbMod.db
      .select()
      .from(schemaMod.assets)
      .where(eq(schemaMod.assets.projectId, project.id));
    expect(remainingScenes).toHaveLength(0);
    expect(remainingAssets).toHaveLength(0);
  });
});
