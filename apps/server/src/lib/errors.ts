import type { Context } from "hono";

export type ApiErrorCode = "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "INTERNAL";

// Uniform error type for the whole API — routes/index.ts's onError handler
// maps this (and ZodError) to the ApiErrorSchema shape from @app/core.
export class ApiHttpError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status: 400 | 404 | 409 | 500,
    public readonly issues?: unknown[],
  ) {
    super(message);
    this.name = "ApiHttpError";
  }
}

export class NotFoundError extends ApiHttpError {
  constructor(message: string) {
    super("NOT_FOUND", message, 404);
  }
}

export class ConflictError extends ApiHttpError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
  }
}

// Shared response body for a failed @hono/zod-validator check, used inline
// at each zValidator(...) call so every validated route returns the same
// ApiErrorSchema shape instead of the validator's default response. Kept
// inline (not a typed Hook function) because @hono/zod-validator's Hook
// generic is schema-specific — a standalone typed wrapper fights inference.
export function validationErrorResponse(c: Context, issues: unknown[]) {
  return c.json({ error: { code: "VALIDATION" as const, message: "invalid request body", issues } }, 400);
}
