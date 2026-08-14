import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Lives in apps/server, NOT packages/core — core must stay runtime-agnostic
 * (no node:*, no Bun.*) because the studio (browser) imports from the same
 * barrel. Zod schemas in core remain canonical for the API boundary; rows
 * here are mapped to/from core types in db/mappers.ts, which is the only
 * place that knows both shapes.
 *
 * ownerId is nullable and unused locally — added now so a future cloud
 * version doesn't need a NOT NULL migration on a populated table.
 */

export const settings = sqliteTable("settings", {
  // Single-row table: id is always 1.
  id: integer("id").primaryKey().default(1),
  projectsRoot: text("projects_root").notNull(),
  defaultFormat: text("default_format").notNull(),
  defaultTemplateId: text("default_template_id").notNull(),
  defaultVoice: text("default_voice", { mode: "json" }).notNull(),
  providers: text("providers", { mode: "json" }).notNull(),
  render: text("render", { mode: "json" }).notNull(),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  ownerId: text("owner_id"),

  formatWidth: integer("format_width").notNull(),
  formatHeight: integer("format_height").notNull(),
  formatFps: integer("format_fps").notNull(),
  templateId: text("template_id").notNull(),

  voice: text("voice", { mode: "json" }).notNull(),
  bgm: text("bgm", { mode: "json" }).notNull(),
  captionsConfig: text("captions_config", { mode: "json" }).notNull(),

  // null until the first render.
  lastRender: text("last_render", { mode: "json" }),
  // Stamp of the mixHash the current audio/master.wav was built from —
  // replaces .cache/master.hash.
  masterHash: text("master_hash"),
});

export const scenes = sqliteTable(
  "scenes",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    text: text("text").notNull(),
    overlayText: text("overlay_text"),
    media: text("media", { mode: "json" }).notNull(),
    audio: text("audio", { mode: "json" }),
    transitionOut: text("transition_out", { mode: "json" }).notNull(),
    ownerId: text("owner_id"),
  },
  (table) => [index("scenes_project_order_idx").on(table.projectId, table.order)],
);

export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    kind: text("kind").notNull(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    width: real("width"),
    height: real("height"),
    durationMs: real("duration_ms"),
    sourceProvider: text("source_provider").notNull(),
    sourceMeta: text("source_meta", { mode: "json" }),
    createdAt: text("created_at").notNull(),
    ownerId: text("owner_id"),
  },
  (table) => [index("assets_project_idx").on(table.projectId)],
);

// 1:1 with project — whisper output for the whole voiceover, not per scene.
export const captions = sqliteTable("captions", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  hash: text("hash").notNull(),
  model: text("model").notNull(),
  words: text("words", { mode: "json" }).notNull(),
  createdAt: text("created_at").notNull(),
});

export const schema = { settings, projects, scenes, assets, captions };
