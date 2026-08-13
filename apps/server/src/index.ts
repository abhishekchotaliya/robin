import { Hono } from "hono";
import { cors } from "hono/cors";
import { ensureProjectsRoot } from "./config.ts";
import { ApiHttpError } from "./lib/errors.ts";
import { assetsRoutes } from "./routes/assets.ts";
import { filesRoutes } from "./routes/files.ts";
import { healthRoutes } from "./routes/health.ts";
import { jobsRoutes } from "./routes/jobs.ts";
import { projectsRoutes } from "./routes/projects.ts";
import { settingsRoutes } from "./routes/settings.ts";
import { ttsRoutes } from "./routes/tts.ts";

await ensureProjectsRoot();

const app = new Hono();

app.use("/api/*", cors({ origin: "http://localhost:5173" }));

app.onError((err, c) => {
  if (err instanceof ApiHttpError) {
    return c.json({ error: { code: err.code, message: err.message, issues: err.issues } }, err.status);
  }
  console.error("[server] unhandled error:", err);
  return c.json({ error: { code: "INTERNAL" as const, message: "internal server error" } }, 500);
});

app.route("/api/health", healthRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api/jobs", jobsRoutes);
// assetsRoutes and ttsRoutes own sub-paths of /api/projects/:id — mounted
// first so their more specific paths win over the projects router's /:id.
app.route("/api/projects", assetsRoutes);
app.route("/api/projects", ttsRoutes);
app.route("/api/projects", projectsRoutes);
app.route("/files", filesRoutes);

const port = 8787;
console.log(`server listening on :${port}`);

export default {
  port,
  fetch: app.fetch,
};
