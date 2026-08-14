import { Hono } from "hono";
import { HealthSchema } from "@app/core";
import { PROJECTS_ROOT } from "../config.ts";

export const healthRoutes = new Hono().get("/", (c) => {
  const health = HealthSchema.parse({
    ok: true,
    version: "0.0.1",
    bun: Bun.version,
    projectsRoot: PROJECTS_ROOT,
  });
  return c.json(health);
});
