import { zValidator } from "@hono/zod-validator";
import { CreateProjectRequestSchema, UpdateProjectRequestSchema } from "@app/core";
import { Hono } from "hono";
import { NotFoundError, validationErrorResponse } from "../lib/errors.ts";
import {
  createProject,
  deleteProject,
  duplicateProject,
  getProject,
  listProjects,
  updateProject,
} from "../store/projects.ts";

export const projectsRoutes = new Hono()
  .get("/", async (c) => {
    return c.json(await listProjects());
  })

  .post(
    "/",
    zValidator("json", CreateProjectRequestSchema, (result, c) => {
      if (!result.success) return validationErrorResponse(c, result.error.issues);
    }),
    async (c) => {
      const project = await createProject(c.req.valid("json"));
      return c.json(project, 201);
    },
  )

  .get("/:id", async (c) => {
    const project = await getProject(c.req.param("id"));
    if (!project) throw new NotFoundError(`project ${c.req.param("id")} not found`);
    return c.json(project);
  })

  .patch(
    "/:id",
    zValidator("json", UpdateProjectRequestSchema, (result, c) => {
      if (!result.success) return validationErrorResponse(c, result.error.issues);
    }),
    async (c) => {
      const project = await updateProject(c.req.param("id"), c.req.valid("json"));
      return c.json(project);
    },
  )

  .post("/:id/duplicate", async (c) => {
    return c.json(await duplicateProject(c.req.param("id")), 201);
  })

  .delete("/:id", async (c) => {
    await deleteProject(c.req.param("id"));
    return c.body(null, 204);
  });
