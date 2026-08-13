import { rename } from "node:fs/promises";

// Serialize -> write "<file>.tmp" -> rename. rename() is atomic on the same
// filesystem, so a crash mid-write can never leave a half-written
// project.json behind (that would be unrecoverable data loss for the user).
export async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  const tmpPath = `${path}.tmp`;
  await Bun.write(tmpPath, `${JSON.stringify(data, null, 2)}\n`);
  await rename(tmpPath, path);
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await Bun.file(path).text()) as T;
}

export async function pathExists(path: string): Promise<boolean> {
  return Bun.file(path).exists();
}
