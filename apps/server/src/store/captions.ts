import { eq } from "drizzle-orm";
import { CaptionsFileSchema, type CaptionsFile } from "@app/core";
import { db } from "../db/client.ts";
import { captionsToRow, rowToCaptions } from "../db/mappers.ts";
import { captions } from "../db/schema.ts";
import { NotFoundError } from "../lib/errors.ts";
import { findProjectSlugById } from "./projects.ts";

export async function readCaptions(projectId: string): Promise<CaptionsFile | null> {
  if (!(await findProjectSlugById(projectId))) throw new NotFoundError(`project ${projectId} not found`);
  const [row] = await db.select().from(captions).where(eq(captions.projectId, projectId)).limit(1);
  if (!row) return null;
  try {
    return rowToCaptions(row);
  } catch (err) {
    console.error(`[captions] malformed captions row for project ${projectId}, treating as absent:`, err);
    return null;
  }
}

export async function writeCaptions(projectId: string, file: CaptionsFile): Promise<void> {
  if (!(await findProjectSlugById(projectId))) throw new NotFoundError(`project ${projectId} not found`);
  const row = captionsToRow(projectId, CaptionsFileSchema.parse(file));
  await db.insert(captions).values(row).onConflictDoUpdate({ target: captions.projectId, set: row });
}
