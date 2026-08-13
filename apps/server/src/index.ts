import { Hono } from "hono";
import { cors } from "hono/cors";
import { ensureProjectsRoot } from "./config.ts";
import { healthRoutes } from "./routes/health.ts";

await ensureProjectsRoot();

const app = new Hono();

app.use("/api/*", cors({ origin: "http://localhost:5173" }));
app.route("/api/health", healthRoutes);

const port = 8787;
console.log(`server listening on :${port}`);

export default {
  port,
  fetch: app.fetch,
};
