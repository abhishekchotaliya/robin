import { defineConfig } from "drizzle-kit";

// Only used by `drizzle-kit generate` (dev-time, offline). The running
// server never reads this file — it opens the DB itself in db/client.ts.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
});
