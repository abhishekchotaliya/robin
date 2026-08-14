// Backs every cache key in the render pipeline (VO files, mix output,
// manifest short-circuit). NEVER change this algorithm — hashes persist on
// disk as filenames and cache keys across sessions; changing it silently
// invalidates every cached artifact a user has on disk.
//
// Deliberately NOT node:crypto: this module is re-exported from the
// package's single index.ts, which the browser bundle also imports (for the
// Zod schemas). A node:-only import here would break the studio build the
// moment anything touches @app/core. FNV-1a is more than sufficient entropy
// for a content-addressed cache key (not a security boundary) and runs
// identically in Bun and the browser via BigInt, no async Web Crypto needed.
const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

export function hashContent(...parts: string[]): string {
  const input = parts.join(" ");
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, "0");
}
