# Faceless Video Studio

Local app that turns a written script into a rendered vertical short: script → TTS voiceover → word-level captions → ducked BGM mix → Remotion render, behind one button.

Two-process local app: React UI on **5173**, Bun/Hono API server on **8787** that owns the filesystem and all secrets. Vite proxies `/api` and `/files` to the server. Browsers can't run FFmpeg, Whisper, or Remotion's renderer, and can't write to disk — that's why this isn't a pure SPA.

Full build plan (all phases, UX spec, pipeline design): `/Users/axar7/.claude/plans/faceless-video-studio-nested-hippo.md`. Build one phase at a time, commit at each boundary.

## Standing rules

- **Bun only** — never npm/pnpm/npx; use `bun`/`bunx`. New deps with lifecycle install scripts must be added to root `trustedDependencies` (see `ffmpeg-static` for the pattern).
- **Never `any`.** All types derive from Zod schemas in `packages/core`.
- **Server owns the filesystem and all secrets.** The UI touches disk only through the API. API keys never serialize to the browser — `GET /api/settings` returns key *presence* (`configured: boolean`), never values.
- **Every long operation is a job with SSE progress**, never a blocking request.
- **New capabilities arrive as a provider implementation**, never as pipeline changes. Image gen, stock search, another TTS engine — always a new file in `providers/`, never a change to the pipeline steps.
- **Every pipeline step is idempotent and content-hash-cached.** Never change `hashContent`'s algorithm — hashes persist on disk as filenames and cache keys across sessions.
- **Scenes are narration-driven.** VO length determines scene duration. Never add an explicit per-scene duration field — this is deliberate, it removes a whole class of sync bugs.
- **Remotion's `inputProps` is always a compiled `RenderManifest`, never a raw `Project`.** The server compiles one from the other via `compileManifest()`.
- `remotionb` for Remotion CLI invocations (Bun runtime), not `remotion`. All `@remotion/*` packages must share one exact version.
- One phase per session. Run `bun run typecheck` (and `bun test` where tests exist) before every commit.

## Repo layout

```
apps/server    Bun + Hono API — src/index.ts (assembly only), config.ts, routes/, store/, services/ (Phase 4+), providers/ (Phase 4+), jobs/ (Phase 8), lib/
apps/studio    React 19 + Vite + Tailwind 4 + shadcn — src/routes/ (pages), components/ (app + ui/ shadcn), hooks/, lib/api.ts, stores/ (Zustand, ephemeral UI only)
packages/core  Zod schemas + pure helpers, NO build step — exports "./src/index.ts" directly, Bun and Vite both consume the TS source
packages/video Remotion project (Phase 7+) — scripts use `remotionb`
```

User project data lives **outside the repo**, default `~/VideoStudio/` (override: env `VIDEO_STUDIO_ROOT`):

```
~/VideoStudio/
  settings.json
  projects/<slug>/
    project.json          single source of truth, atomic-written
    assets.json            asset index (Phase 3+)
    assets/                 uploads
    audio/vo/<hash>.mp3    TTS output, content-hash named
    audio/master.wav       mixed VO + ducked BGM (Phase 6+)
    captions/words.json    whisper word timestamps (Phase 5+)
    renders/                output mp4s + metadata
    .cache/                 remotion bundle, probe results
```

## Data model (`packages/core`)

Schemas live in `src/schemas/{project,asset,job,settings,manifest,api}.ts`, helpers in `src/helpers/{slug,hash,duration,defaults,manifest-compile}.ts`, everything re-exported from `src/index.ts`.

- **Project** → **Scene[]** (narration text drives duration) → optional **Asset** ref + **KenBurns** config
- **Status is derived, never hand-set**: `deriveStatus(project)` recomputes on every server write. `draft` (empty/no scenes) → `scripted` (all scenes have text) → `voiced` (every scene's `audio.hash` matches `sceneAudioHash(text, voice)` — i.e. not stale) → `ready` (voiced + every non-color scene has an asset) → `rendered` (ready + `lastRender.manifestHash` matches the current compiled manifest).
- **RenderManifest is compiled, not stored.** `compileManifest(project, { pathMode, projectDir, assets, words, masterAudioExists })` produces frame-accurate scene offsets (300ms `SCENE_GAP_MS` between scenes), resolves media to either `/files/...` URLs (`pathMode: "http"`, for the browser Player) or absolute paths (`pathMode: "fs"`, for `renderMedia`), and pre-groups caption words into lines — never group captions per-frame in the Remotion component, that's a real performance trap.
- **`hashContent(...parts)` is FNV-1a via BigInt, not `node:crypto`.** This is deliberate: `packages/core`'s `index.ts` does `export *` from every module, and the studio (browser) imports from the same barrel for the Zod schemas. A `node:crypto` import anywhere in that reachable graph breaks the browser build the moment anything touches `@app/core`, because native ESM evaluates the whole static import graph regardless of what's actually used. Keep every core helper runtime-agnostic (no `node:*`, no `Bun.*`) for the same reason.

## Server conventions (`apps/server`)

- `index.ts` is assembly only (`app.route(...)`, `app.onError(...)`) — zero business logic.
- Every route validated with `@hono/zod-validator`, hook written inline per call (not as a shared typed function — its `Hook<...>` generic is schema-specific per call site and fights a standalone wrapper's inference). Copy the inline pattern from `routes/projects.ts`.
- **Uniform error shape everywhere**: `{ error: { code, message, issues? } }`. Throw `NotFoundError`/`ConflictError`/`ApiHttpError` from `lib/errors.ts`; the `app.onError` handler in `index.ts` maps them to the right status. Unexpected errors log full detail server-side, return a generic 500 `INTERNAL` message to the client.
- **Atomic JSON writes only** (`lib/fsx.ts`: serialize → write `<file>.tmp` → `rename`). A half-written `project.json` from a crash mid-write is unrecoverable data loss.
- **Per-key async mutex** (`lib/mutex.ts`, `projectMutex`) around every project read-modify-write. Without it, overlapping PATCHes (autosave firing while the user keeps typing) race and the loser's edit silently vanishes.
- **PATCH is shallow-merge, not deep-merge.** `scenes` (and any other array/object field) replaces wholesale when present in the patch body — the client always sends the full array. Deep-merging arrays is a bug factory.
- Projects are looked up by `id` but folders are named by `slug` (slug is immutable after creation; rename only changes `title`). `store/projects.ts` scans `projects/` and matches on `id` — fine at this scale; add an index only if listing hundreds of projects gets slow. A `project.json` that fails to parse is skipped and logged, never thrown — one corrupt project must never take down the whole list, and it also means that project becomes undeletable by `id` until its `id` is fixed by hand (expected, not a bug — filesystem is hand-editable by design).
- `settings.json` lives at `~/VideoStudio/settings.json`, lazily created with defaults on first read via `store/settings.ts`. It holds provider API keys — `getSettings()` is server-internal only; never send its raw shape to the browser (use `toPublicSettings()` from core when a settings route is added).

## UI conventions (`apps/studio`)

- `lib/api.ts` is the **only** module that calls `fetch`. Every response is parsed through the matching core Zod schema, so a drifting server fails loudly in dev instead of a confusing bug three components later.
- TanStack Query for all server state (`hooks/useProjects.ts` is the pattern to copy — list/get/create/update/delete, mutations invalidate `["projects"]` and `setQueryData` the detail cache on update to avoid a refetch storm). Zustand only for ephemeral UI state (selected scene, playhead) — nothing server-derived belongs there.
- `<StatusBadge>` (`components/status-badge.tsx`) is the single source of the status→color mapping — reuse it everywhere a status shows, don't reimplement the color logic.
- Dark mode is the default (`components/theme-provider.tsx`, `next-themes`, `attribute="class"`). Toggle via `<ThemeToggle>`.
- shadcn components live in `src/components/ui/` — regenerate via `bunx shadcn@latest add <name>`, never hand-edit generated files. **After `bunx shadcn init`, add `compilerOptions.paths: { "@/*": ["./src/*"] }` directly to `apps/studio/tsconfig.json`** (the solution-style root config, not `tsconfig.app.json`) — the shadcn CLI reads that exact file to resolve the `@/*` alias, and without it the CLI silently creates a literal `./@/` directory instead of writing into `src/`.
- **Radix `DropdownMenu` fights programmatic focus after closing.** It returns focus to its trigger button on close via its own internal timing, which runs *after* a naive `autoFocus` or `requestAnimationFrame`-based focus call on something the menu item just revealed (e.g. an inline rename `<Input>`) — the two race, Radix wins, and the thing you meant to focus blurs itself almost immediately. Fix: pass `onCloseAutoFocus={(e) => e.preventDefault()}` to the `DropdownMenuContent` whenever a menu item hands off focus to something else (inline edit, a dialog it opens). See `components/project-card.tsx` for the pattern (rename-in-place + delete confirmation both hang off the same menu).
- Every async mutation shows a pending state on its own trigger and a `sonner` toast on failure (success toasts only for direct user actions — create/delete — never for autosave). Every list has designed loading/empty/error states — copy the pattern in `routes/projects-list.tsx`.
- `react-hook-form` + `@hookform/resolvers/zod` + the shared core schema for forms needing validation (see `components/new-project-dialog.tsx`). **Version pin matters**: `@hookform/resolvers` requires `react-hook-form ^7.55.0`, and only `@hookform/resolvers ^5.x` supports Zod 4 — both are pinned correctly in `apps/studio/package.json`; don't downgrade either without checking the other.

## Pipeline (Phases 4–8 — not built yet as of Phase 1)

Seven-step server-side job, every step content-hash-cached:

| # | Step | Tool | Cache key |
|---|---|---|---|
| 1 | validate | Zod + asset preflight | — |
| 2 | tts (per scene) | ElevenLabs provider | `hashContent(text, voiceId, speed, stability)` |
| 3 | probe | `ffprobe-static` | file hash |
| 4 | timeline | `compileManifest` (pure) | — |
| 5 | captions | whisper.cpp (`@remotion/install-whisper-cpp`) | hash of concatenated VO |
| 6 | mix | `ffmpeg-static` | `hashContent(vo hashes…, bgm settings)` |
| 7 | render | `@remotion/renderer` `renderMedia` | manifest hash |

Known gotchas for when these phases get built: whisper.cpp needs **16kHz mono WAV** input, silently garbage otherwise — convert with ffmpeg first, and transcribe the *same* concatenated-with-gaps audio the timeline uses so word timestamps line up. The mix step (6) is one FFmpeg filter graph — concat with 300ms gaps → loop/trim BGM → `sidechaincompress` to duck under speech → `amix` → `loudnorm` to **-14 LUFS** (YouTube's target) → single `master.wav`. Remotion should only ever see that one audio file, never the individual VO clips.

## Provider interfaces (Phase 4+, define even with one implementation)

```ts
TTSProvider    { id, listVoices(), synthesize(text, opts) → Buffer }
ImageProvider  { id, generate(prompt, opts) → Asset }   // stub until needed
VideoProvider  { id, generate(prompt, opts) → Asset }   // stub until needed
StockProvider  { id, search(query) → Asset[] }          // stub until needed
```

Registered in a map keyed by `providerId` in `providers/registry.ts`. Adding a new one is a new file plus a registry entry — never a change to `services/`.

## Verification

```bash
bun install && bun dev
```

`bun run typecheck` must be clean across all packages before every commit. Where `bun test` files exist (currently `packages/core/src/helpers/*.test.ts`), they must pass too.
