import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PROJECTS_ROOT } from "../config.ts";
import { schema } from "./schema.ts";

// Overridable so store tests can point at an isolated ":memory:" database
// instead of the real ~/VideoStudio/studio.db — must be set before this
// module is first imported, since the connection below opens immediately.
export const DB_FILE = process.env.STUDIO_DB_FILE ?? join(PROJECTS_ROOT, "studio.db");

const sqlite = new Database(DB_FILE, { create: true });
// WAL: readers (the API server handling many requests) don't block on a
// writer (autosave). Meaningful even single-process, since Hono handles
// requests concurrently.
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

export const db = drizzle(sqlite, { schema });

const MIGRATIONS_FOLDER = join(dirname(fileURLToPath(import.meta.url)), "migrations");

/** Runs on server boot so a fresh clone (or a fresh VIDEO_STUDIO_ROOT) just works. */
export function runMigrations(): void {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
