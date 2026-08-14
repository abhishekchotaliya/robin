import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  createEmptyProject,
  deriveStatus,
  estimateSceneDurationMs,
  ProjectSchema,
  slugify,
  type CreateProjectRequest,
  type Project,
  type ProjectListItem,
  type UpdateProjectRequest,
} from "@app/core";
import { PROJECTS_DIR } from "../config.ts";
import { NotFoundError } from "../lib/errors.ts";
import { dirExists, pathExists, readJson, writeJsonAtomic } from "../lib/fsx.ts";
import { projectMutex } from "../lib/mutex.ts";
import { getSettings } from "./settings.ts";

const PROJECT_FILE = "project.json";

export function projectDir(slug: string): string {
  return join(PROJECTS_DIR, slug);
}

async function listProjectSlugs(): Promise<string[]> {
  await mkdir(PROJECTS_DIR, { recursive: true });
  const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

// Skips and logs malformed project.json instead of throwing — one corrupt
// project must never take down the whole list.
async function tryReadProject(slug: string): Promise<Project | null> {
  const file = join(projectDir(slug), PROJECT_FILE);
  if (!(await pathExists(file))) return null;
  try {
    return ProjectSchema.parse(await readJson<unknown>(file));
  } catch (err) {
    console.error(`[store] skipping malformed project.json at ${file}:`, err);
    return null;
  }
}

// Folders are named by slug; the API deals in ids. Fine to scan at this
// scale — see plan §2: add an index only if listing hundreds of projects
// gets slow.
export async function findProjectSlugById(id: string): Promise<string | null> {
  for (const slug of await listProjectSlugs()) {
    const project = await tryReadProject(slug);
    if (project?.id === id) return slug;
  }
  return null;
}

function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export async function listProjects(): Promise<ProjectListItem[]> {
  const slugs = await listProjectSlugs();
  const items: ProjectListItem[] = [];
  for (const slug of slugs) {
    const project = await tryReadProject(slug);
    if (!project) continue;
    const estimatedDurationMs = project.scenes.reduce(
      (sum, s) => sum + (s.audio?.durationMs ?? estimateSceneDurationMs(s.text)),
      0,
    );
    items.push({
      id: project.id,
      slug: project.slug,
      title: project.title,
      status: project.status,
      updatedAt: project.updatedAt,
      sceneCount: project.scenes.length,
      estimatedDurationMs,
      // Only claim a thumbnail when one is really on disk: a project
      // rendered before poster frames existed has a lastRender but no
      // image, and pointing at it would show a broken card.
      thumbnailUrl: (await pathExists(join(projectDir(slug), "renders", "thumbnail.jpg")))
        ? `/files/${project.slug}/renders/thumbnail.jpg`
        : null,
    });
  }
  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return items;
}

export async function getProject(id: string): Promise<Project | null> {
  const slug = await findProjectSlugById(id);
  if (!slug) return null;
  return tryReadProject(slug);
}

export async function createProject(input: CreateProjectRequest): Promise<Project> {
  const settings = await getSettings();
  const taken = new Set(await listProjectSlugs());
  const slug = uniqueSlug(slugify(input.title), taken);

  const project = createEmptyProject({
    title: input.title,
    slug,
    formatPreset: input.formatPreset,
    templateId: input.templateId,
    defaults: settings,
  });

  const dir = projectDir(slug);
  await mkdir(join(dir, "assets"), { recursive: true });
  await mkdir(join(dir, "audio", "vo"), { recursive: true });
  await mkdir(join(dir, "captions"), { recursive: true });
  await mkdir(join(dir, "renders"), { recursive: true });
  await mkdir(join(dir, ".cache"), { recursive: true });

  await writeJsonAtomic(join(dir, PROJECT_FILE), project);
  return project;
}

/**
 * `currentManifestHash` is what lets deriveStatus reach "rendered" — it can
 * only claim the video is current if it knows what the current manifest
 * hashes to, and compiling one on every autosave write would mean reading
 * assets and captions from disk on each keystroke. Only the renderer knows
 * it (and has just computed it), so only the renderer passes it. Any later
 * edit recomputes without it and drops back to "ready", which is the honest
 * answer: an edit may well have invalidated the render.
 */
export async function updateProject(
  id: string,
  patch: UpdateProjectRequest,
  opts: { currentManifestHash?: string } = {},
): Promise<Project> {
  return projectMutex.run(id, async () => {
    const slug = await findProjectSlugById(id);
    if (!slug) throw new NotFoundError(`project ${id} not found`);
    const current = await tryReadProject(slug);
    if (!current) throw new NotFoundError(`project ${id} not found`);

    // Shallow merge: top-level fields overwrite; `scenes` (if present in the
    // patch) replaces wholesale rather than deep-merging — the client always
    // sends the full scenes array, and deep-merging arrays is a bug factory.
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
    await writeJsonAtomic(join(projectDir(slug), PROJECT_FILE), validated);
    return validated;
  });
}

/**
 * Copies a project into a new one. Everything the user made or paid for
 * comes along — assets, generated voiceover, captions — so the duplicate is
 * immediately usable rather than needing every step re-run. Renders are
 * deliberately left behind: the copy hasn't been rendered, and claiming
 * otherwise would show a stale video as its own.
 */
export async function duplicateProject(id: string): Promise<Project> {
  const sourceSlug = await findProjectSlugById(id);
  if (!sourceSlug) throw new NotFoundError(`project ${id} not found`);
  const source = await tryReadProject(sourceSlug);
  if (!source) throw new NotFoundError(`project ${id} not found`);

  const taken = new Set(await listProjectSlugs());
  const title = `${source.title} copy`;
  const slug = uniqueSlug(slugify(title), taken);
  const targetDir = projectDir(slug);

  await mkdir(targetDir, { recursive: true });
  for (const sub of ["assets", "audio/vo", "captions", "renders", ".cache"]) {
    await mkdir(join(targetDir, sub), { recursive: true });
  }

  // cp -R for the reusable inputs; skip renders and .cache, which belong to
  // the original's output and would be misleading here.
  for (const sub of ["assets", "audio", "captions"]) {
    const from = join(projectDir(sourceSlug), sub);
    if (await dirExists(from)) {
      await cp(from, join(targetDir, sub), { recursive: true });
    }
  }
  const assetsIndex = join(projectDir(sourceSlug), "assets.json");
  if (await pathExists(assetsIndex)) {
    await cp(assetsIndex, join(targetDir, "assets.json"));
  }

  const now = new Date().toISOString();
  const copy: Project = {
    ...source,
    id: crypto.randomUUID(),
    slug,
    title,
    createdAt: now,
    updatedAt: now,
    lastRender: null,
  };
  copy.status = deriveStatus(copy);

  await writeJsonAtomic(join(targetDir, PROJECT_FILE), ProjectSchema.parse(copy));
  return copy;
}

export async function deleteProject(id: string): Promise<void> {
  const slug = await findProjectSlugById(id);
  if (!slug) throw new NotFoundError(`project ${id} not found`);
  await rm(projectDir(slug), { recursive: true, force: true });
}
