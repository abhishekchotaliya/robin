import { zValidator } from "@hono/zod-validator";
import { UpdateSettingsRequestSchema, toPublicSettings } from "@app/core";
import { Hono } from "hono";
import { validationErrorResponse } from "../lib/errors.ts";
import { getSettings, updateSettings } from "../store/settings.ts";
import { ttsProviders } from "../providers/registry.ts";
import { runHealthChecks } from "../services/health.ts";

// Both handlers return toPublicSettings() — the raw Settings shape holds
// provider API keys and must never reach the browser. Keys are write-only:
// settable via PATCH, reported only as `configured: boolean`.
export const settingsRoutes = new Hono()
  .get("/", async (c) => {
    return c.json(toPublicSettings(await getSettings()));
  })

  .patch(
    "/",
    zValidator("json", UpdateSettingsRequestSchema, (result, c) => {
      if (!result.success) return validationErrorResponse(c, result.error.issues);
    }),
    async (c) => {
      return c.json(toPublicSettings(await updateSettings(c.req.valid("json"))));
    },
  )

  .get("/health", async (c) => {
    return c.json(await runHealthChecks());
  })

  // Voice list for the picker. Lives here rather than under /projects because
  // voices belong to the provider account, not to any one project.
  .get("/voices/:providerId", async (c) => {
    const settings = await getSettings();
    const provider = ttsProviders.get(c.req.param("providerId"));
    if (!provider) return c.json([]);
    if (!provider.isConfigured(settings)) return c.json([]);
    return c.json(await provider.listVoices(settings));
  });
