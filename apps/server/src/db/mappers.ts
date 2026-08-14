import {
  AssetSchema,
  CaptionsFileSchema,
  ProjectSchema,
  SceneSchema,
  SettingsSchema,
  type Asset,
  type CaptionsFile,
  type Project,
  type Scene,
  type Settings,
} from "@app/core";
import type * as schema from "./schema.ts";

/**
 * The only place that knows both the row shape and the core Zod shape.
 * Every function here returns a value parsed through the matching core
 * schema, so a mapper bug (missing field, wrong type) fails loudly right
 * here instead of surfacing as a confusing bug three services downstream —
 * same rule the API client (lib/api.ts) follows on the studio side.
 */

type ProjectRow = typeof schema.projects.$inferSelect;
type SceneRow = typeof schema.scenes.$inferSelect;
type AssetRow = typeof schema.assets.$inferSelect;
type SettingsRow = typeof schema.settings.$inferSelect;
type CaptionsRow = typeof schema.captions.$inferSelect;

export function rowToScene(row: SceneRow): Scene {
  return SceneSchema.parse({
    id: row.id,
    order: row.order,
    text: row.text,
    overlayText: row.overlayText,
    media: row.media,
    audio: row.audio,
    transitionOut: row.transitionOut,
  });
}

export function sceneToRow(projectId: string, scene: Scene): typeof schema.scenes.$inferInsert {
  return {
    id: scene.id,
    projectId,
    order: scene.order,
    text: scene.text,
    overlayText: scene.overlayText,
    media: scene.media,
    audio: scene.audio,
    transitionOut: scene.transitionOut,
  };
}

/** `scenes` must already be sorted by `order` — callers own that (the store queries with `orderBy`). */
export function rowToProject(row: ProjectRow, sceneRows: SceneRow[]): Project {
  return ProjectSchema.parse({
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    format: { width: row.formatWidth, height: row.formatHeight, fps: row.formatFps },
    templateId: row.templateId,
    voice: row.voice,
    bgm: row.bgm,
    captions: row.captionsConfig,
    scenes: sceneRows.map(rowToScene),
    lastRender: row.lastRender,
  });
}

export function projectToRow(project: Project): typeof schema.projects.$inferInsert {
  return {
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
  };
}

export function rowToAsset(row: AssetRow): Asset {
  return AssetSchema.parse({
    id: row.id,
    filename: row.filename,
    kind: row.kind,
    mime: row.mime,
    bytes: row.bytes,
    width: row.width,
    height: row.height,
    durationMs: row.durationMs,
    sourceProvider: row.sourceProvider,
    sourceMeta: row.sourceMeta,
    createdAt: row.createdAt,
  });
}

export function assetToRow(projectId: string, asset: Asset): typeof schema.assets.$inferInsert {
  return {
    id: asset.id,
    projectId,
    filename: asset.filename,
    kind: asset.kind,
    mime: asset.mime,
    bytes: asset.bytes,
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs,
    sourceProvider: asset.sourceProvider,
    sourceMeta: asset.sourceMeta,
    createdAt: asset.createdAt,
  };
}

export function rowToSettings(row: SettingsRow): Settings {
  return SettingsSchema.parse({
    projectsRoot: row.projectsRoot,
    defaultFormat: row.defaultFormat,
    defaultTemplateId: row.defaultTemplateId,
    defaultVoice: row.defaultVoice,
    providers: row.providers,
    render: row.render,
  });
}

export function settingsToRow(settings: Settings): typeof schema.settings.$inferInsert {
  return {
    id: 1,
    projectsRoot: settings.projectsRoot,
    defaultFormat: settings.defaultFormat,
    defaultTemplateId: settings.defaultTemplateId,
    defaultVoice: settings.defaultVoice,
    providers: settings.providers,
    render: settings.render,
  };
}

export function rowToCaptions(row: CaptionsRow): CaptionsFile {
  return CaptionsFileSchema.parse({
    hash: row.hash,
    model: row.model,
    words: row.words,
    createdAt: row.createdAt,
  });
}

export function captionsToRow(projectId: string, captions: CaptionsFile): typeof schema.captions.$inferInsert {
  return {
    projectId,
    hash: captions.hash,
    model: captions.model,
    words: captions.words,
    createdAt: captions.createdAt,
  };
}
