import type { AssetKind } from "../schemas/asset.ts";

// Upload allowlist. The server rejects anything not listed here rather than
// trusting the browser's declared type, and the kind is derived from the
// mime rather than the file extension (extensions lie, and the extension is
// attacker-controlled on upload).
export const ACCEPTED_MIME_TYPES: Readonly<Record<string, AssetKind>> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/avif": "image",
  "image/gif": "image",
  "video/mp4": "video",
  "video/quicktime": "video",
  "video/webm": "video",
  "audio/mpeg": "audio",
  "audio/wav": "audio",
  "audio/x-wav": "audio",
  "audio/mp4": "audio",
  "audio/aac": "audio",
  "audio/ogg": "audio",
};

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500MB — a long 4K clip fits

export function assetKindFromMime(mime: string): AssetKind | null {
  return ACCEPTED_MIME_TYPES[mime.toLowerCase().split(";")[0]?.trim() ?? ""] ?? null;
}

export function isAcceptedMime(mime: string): boolean {
  return assetKindFromMime(mime) !== null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Uploaded names reach the filesystem, so strip anything that could escape
// the assets/ directory or confuse a shell later in the pipeline. A content
// hash prefix (added by the server) keeps the result unique.
export function sanitizeFilename(filename: string): string {
  const base = filename
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 100);
  return base.length > 0 ? base : "file";
}
