import { z } from "zod";

export const AssetKindSchema = z.enum(["image", "video", "audio"]);
export type AssetKind = z.infer<typeof AssetKindSchema>;

export const AssetSourceProviderSchema = z.enum(["upload", "flux", "runway", "pexels"]);
export type AssetSourceProvider = z.infer<typeof AssetSourceProviderSchema>;

export const AssetSchema = z.object({
  id: z.string(),
  filename: z.string(), // as stored under assets/
  kind: AssetKindSchema,
  mime: z.string(),
  bytes: z.number(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  durationMs: z.number().nullable(),
  sourceProvider: AssetSourceProviderSchema,
  sourceMeta: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
});
export type Asset = z.infer<typeof AssetSchema>;

// Sits next to project.json as assets.json — same atomic-write rules apply.
export const AssetIndexSchema = z.object({
  assets: z.array(AssetSchema),
});
export type AssetIndex = z.infer<typeof AssetIndexSchema>;
