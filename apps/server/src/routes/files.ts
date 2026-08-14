import { normalize, resolve, sep } from "node:path";
import { Hono } from "hono";
import { PROJECTS_DIR } from "../config.ts";
import { NotFoundError } from "../lib/errors.ts";

/**
 * Serves files out of the projects directory so the browser (and the Remotion
 * Player) can load media over HTTP — browsers can't read from disk.
 *
 * Everything after /files/ is attacker-controllable, so the path is resolved
 * to an absolute path and checked to be INSIDE the projects root before any
 * read. Checking the raw string for ".." is not enough: URL-encoded
 * traversal ("%2e%2e%2f"), absolute paths, and symlink-ish inputs all decode
 * or normalize into escapes only after resolution.
 */
export function resolveWithinProjects(requestPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath);
  } catch {
    return null; // malformed percent-encoding
  }

  // NUL byte truncates paths in some syscalls — reject rather than sanitize.
  if (decoded.includes("\0")) return null;

  const candidate = resolve(PROJECTS_DIR, normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, ""));
  const root = resolve(PROJECTS_DIR);

  // Must be strictly inside the root. The separator check stops a sibling
  // directory whose name merely starts with the root's ("/VideoStudio-evil").
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  return candidate;
}

export const filesRoutes = new Hono().get("/*", async (c) => {
  const requestPath = c.req.path.replace(/^\/files\/?/, "");
  const absolute = resolveWithinProjects(requestPath);
  if (!absolute) throw new NotFoundError("file not found");

  const file = Bun.file(absolute);
  if (!(await file.exists())) throw new NotFoundError("file not found");

  return new Response(file, {
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      // Local single-user app; media is immutable once written (uploads are
      // uuid-prefixed, pipeline outputs are content-hashed).
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});
