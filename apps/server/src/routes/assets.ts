import { Hono } from "hono";
import { ApiHttpError } from "../lib/errors.ts";
import { addAssets, deleteAsset, listAssets } from "../store/assets.ts";

export const assetsRoutes = new Hono()
  .get("/:id/assets", async (c) => {
    return c.json(await listAssets(c.req.param("id")));
  })

  .post("/:id/assets", async (c) => {
    // parseBody with `all: true` collects repeated "files" fields into an
    // array; without it a multi-file upload silently keeps only the last one.
    const body = await c.req.parseBody({ all: true });
    const raw = body["files"];
    const files = (Array.isArray(raw) ? raw : [raw]).filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      throw new ApiHttpError("VALIDATION", "no files in request (expected one or more `files` fields)", 400);
    }

    return c.json(await addAssets(c.req.param("id"), files), 201);
  })

  .delete("/:id/assets/:assetId", async (c) => {
    await deleteAsset(c.req.param("id"), c.req.param("assetId"));
    return c.body(null, 204);
  });
