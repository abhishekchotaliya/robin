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

Schemas live in `src/schemas/{project,asset,job,settings,manifest,api}.ts`, helpers in `src/helpers/{slug,hash,duration,defaults,script,manifest-compile}.ts`, everything re-exported from `src/index.ts`.

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
- **`/files/*` is the only route that serves arbitrary paths, and everything after `/files/` is attacker-controlled.** `resolveWithinProjects()` (`routes/files.ts`) decodes, normalizes, resolves to an absolute path, and requires the result to sit strictly inside the projects root before any read — a `..` string check alone is not enough (percent-encoded traversal decodes into an escape afterwards). It also rejects NUL bytes and malformed encodings. `routes/files.test.ts` covers the attack set; extend it rather than loosening the guard. Note this is what keeps `settings.json` (one level above `projects/`, holding API keys) unreachable over HTTP.
- **Uploads are validated before anything touches disk**: the kind comes from an allowlisted mime (`ACCEPTED_MIME_TYPES` in core), never the file extension, and the whole batch is checked before the first write so a bad file can't leave a half-finished upload behind. Stored names are `sanitizeFilename`d and uuid-prefixed so two `sunset.jpg`s can't collide.
- **`assetMutex` is a separate `KeyedMutex` instance from `projectMutex` on purpose** — deleting an asset updates `project.json` to clear scene references, and a nested `run()` on the same instance and key would wait on its own tail forever.
- Deleting an asset clears every scene that referenced it (server side), because a dangling `assetId` renders as a black frame later.

## UI conventions (`apps/studio`)

- `lib/api.ts` is the **only** module that calls `fetch`. Every response is parsed through the matching core Zod schema, so a drifting server fails loudly in dev instead of a confusing bug three components later.
- TanStack Query for all server state (`hooks/useProjects.ts` is the pattern to copy — list/get/create/update/delete, mutations invalidate `["projects"]` and `setQueryData` the detail cache on update to avoid a refetch storm). Zustand only for ephemeral UI state (selected scene, playhead) — nothing server-derived belongs there.
- `<StatusBadge>` (`components/status-badge.tsx`) is the single source of the status→color mapping — reuse it everywhere a status shows, don't reimplement the color logic.
- Dark mode is the default (`components/theme-provider.tsx`, `next-themes`, `attribute="class"`). Toggle via `<ThemeToggle>`.
- shadcn components live in `src/components/ui/` — regenerate via `bunx shadcn@latest add <name>`, never hand-edit generated files. **After `bunx shadcn init`, add `compilerOptions.paths: { "@/*": ["./src/*"] }` directly to `apps/studio/tsconfig.json`** (the solution-style root config, not `tsconfig.app.json`) — the shadcn CLI reads that exact file to resolve the `@/*` alias, and without it the CLI silently creates a literal `./@/` directory instead of writing into `src/`.
- **Radix `DropdownMenu` fights programmatic focus after closing.** It returns focus to its trigger button on close via its own internal timing, which runs *after* a naive `autoFocus` or `requestAnimationFrame`-based focus call on something the menu item just revealed (e.g. an inline rename `<Input>`) — the two race, Radix wins, and the thing you meant to focus blurs itself almost immediately. Fix: pass `onCloseAutoFocus={(e) => e.preventDefault()}` to the `DropdownMenuContent` whenever a menu item hands off focus to something else (inline edit, a dialog it opens). See `components/project-card.tsx` for the pattern (rename-in-place + delete confirmation both hang off the same menu).
- Every async mutation shows a pending state on its own trigger and a `sonner` toast on failure (success toasts only for direct user actions — create/delete — never for autosave). Every list has designed loading/empty/error states — copy the pattern in `routes/projects-list.tsx`.
- **Autosave, never a Save button** (`hooks/useProjectEditor.ts`): 800ms debounce, flush on blur/unmount, Cmd+S forces an immediate save, `<SaveIndicator>` reports it. Two rules that matter: the local `draft` is authoritative once loaded and is **not** re-hydrated on every server response (our own PATCH responses land while the user is still typing and would clobber in-flight keystrokes — it re-hydrates only when the project id changes); and a failed PATCH puts its patch **back** into the pending buffer so the next flush retries it rather than silently dropping the edit.
  - **Consequence to remember**: any endpoint that mutates `project.json` server-side (asset delete clearing scene refs, a TTS job writing `scene.audio`) leaves the open editor showing stale data, because the draft won't pick it up. Invalidating the query alone is not enough. Two ways to fix it, both in use: mirror the change into the draft client-side (`onAssetDeleted` in `routes/project-detail.tsx`), or call `reloadFromServer()` from the editor once the job finishes (what the TTS job does). `reloadFromServer` deliberately refuses to run while local edits are pending, so it can't clobber unsaved keystrokes.
- Editing logic that can live in a pure function belongs in `packages/core`, not a component — `moveScene`/`reindexScenes`/`splitTextIntoScenes` are all unit-tested there, leaving `scene-rail.tsx`'s drop handler two lines. `Scene.order` must always match array position; call `reindexScenes` after any insert/delete/reorder.
- **`react-resizable-panels` v4**: the group prop is `orientation`, not `direction`, and **bare numeric sizes mean pixels** — `defaultSize="22%"` (a string) for percent. `defaultSize={22} maxSize={40}` silently renders a 40px-wide panel.
- shadcn's `Textarea` already carries `field-sizing-content`, so it grows with its content natively. Don't add manual `scrollHeight` auto-grow on top — with `overflow:hidden` the measurement resolves against the flex container and the box balloons to full viewport height.
- `react-hook-form` + `@hookform/resolvers/zod` + the shared core schema for forms needing validation (see `components/new-project-dialog.tsx`). **Version pin matters**: `@hookform/resolvers` requires `react-hook-form ^7.55.0`, and only `@hookform/resolvers ^5.x` supports Zod 4 — both are pinned correctly in `apps/studio/package.json`; don't downgrade either without checking the other.

## Jobs (`apps/server/src/jobs/queue.ts`)

In-memory FIFO, one job at a time, progress pushed over SSE (`routes/jobs.ts`) — long operations are never a blocking request. `enqueueJob(projectId, run)` returns immediately with a job the client watches at `/api/jobs/:id/stream`. Jobs are deliberately **not persisted**: an unfinished job means nothing after a restart, and every step is content-hash cached so re-running is cheap. Runners take a `JobContext` (`setStep`/`setProgress`/`log`/`throwIfCancelled`) and should call `throwIfCancelled()` between units of work so cancel is responsive. Phase 8 runs the full render pipeline through this same queue.

## Native binaries — read before adding another

- **Do not use `ffprobe-static`.** It ships an **x86_64** binary inside its `darwin/arm64` folder, so it dies with `bad CPU type in executable` on Apple Silicon unless Rosetta happens to be installed. Use `@ffprobe-installer/ffprobe`, which publishes a real per-architecture binary as an optional dependency. Assume `ffmpeg-static` may have the same defect and verify with `file $(…path)` before relying on it in phase 6 — `@ffmpeg-installer/ffmpeg` is the equivalent fallback.
- These installer packages set the executable bit in a `postinstall` (`chmod u+x`), which **Bun blocks unless the package is in root `trustedDependencies`** — both the wrapper and each platform package are listed there. Without the entry you get a confusing `EACCES`/permission-denied at runtime rather than a failure at install time. Verify a new binary with `file <path>` and `<path> -version` before writing code against it.

## Pipeline (Phases 5–8 — TTS/probe done, rest not built yet)

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

## Audio mix (`services/mix.ts`)

One FFmpeg filter graph produces `audio/master.wav`: concatenated voiceover (300ms gaps, `computeSceneTimeline`) + music looped with `-stream_loop -1` and trimmed to the voiceover's length → `sidechaincompress` → `amix` → `loudnorm`. **Remotion only ever receives this one file**, never the individual clips — that keeps the render deterministic and means an audio problem can be debugged by playing a wav instead of re-rendering a video.

- The voiceover is `asplit` into two branches: one is the sidechain *key* that triggers ducking, the other is the layer actually heard. Order matters — `[music][voice]sidechaincompress` ducks the music; reversed, it ducks the voice.
- `duckingDb` is a dB figure in the UI but a compressor wants a *ratio*, so `duckingRatio()` converts. Measured: about 10 dB of reduction under speech with full recovery in the gaps.
- `loudnorm=I=-14:TP=-1.5` targets YouTube's normalization point so the platform leaves the audio alone. Verify a master with `ffmpeg -i master.wav -af loudnorm=print_format=json -f null -` and read **`input_i`** (the measurement of that file) — `output_i` describes what a further pass would do and is not the answer.
- Concat format is parameterised (`WHISPER_FORMAT` 16kHz mono vs `MASTER_FORMAT` 48kHz stereo) because whisper's requirement would otherwise degrade the shipped audio.
- Cached on `mixHash` (voiceover hashes + every bgm setting), stamped in `.cache/master.hash`. `GET /api/projects/:id/mix` reports `exists`/`upToDate` so the UI can label its button honestly.

## Timeline and captions

- **`computeSceneTimeline(project)` in core is the single source of scene start times.** `compileManifest` (frames Remotion renders) and the concatenated audio whisper transcribes both derive from it, and a test asserts they agree — if they ever diverge, captions slide out of sync with the picture. The phase-6 mix must use it too. `SCENE_GAP_MS` lives there for the same reason.
- **whisper.cpp accepts 16-bit 16kHz mono WAV and nothing else** — hand it an mp3 or 44.1kHz audio and it emits *silently wrong* timestamps rather than an error. `services/audio-concat.ts` normalizes every clip to that format before concatenating (via the concat demuxer, so the join is a stream copy).
- **Don't pre-create the whisper directory.** `installWhisperCpp` treats an existing folder without the compiled binary as a broken install and refuses to run; it creates the folder itself. Install lives at `~/VideoStudio/.whisper` — one shared build+model per machine, not per project. First run compiles whisper.cpp (~1 min) and downloads the model; later runs are seconds.
- Whisper emits punctuation as separate tokens and gives short tokens zero-length spans (`start === end`), which can never highlight during playback. `normalizeWords` in core merges punctuation onto the preceding word and guarantees every word occupies real time without overrunning the next.
- Captions cache on `captionsHash(project)` — every scene's audio hash plus the gap — so editing media or colours doesn't re-transcribe, while changing narration or scene order does.

## Remotion (`packages/video`)

- **Two entry points, deliberately.** `src/index.ts` calls `registerRoot()` and is referenced *by file path* by the CLI/bundler only. `src/exports.ts` is the package export — components with no side effects — because `registerRoot` firing in the browser when the studio's Player imports `ShortsBasic` would be wrong. The Player mounts the same component the renderer bundles, so preview and output can't drift.
- **Composition props must be a `type`, not an `interface`.** Remotion constrains them to `Record<string, unknown>`, and TypeScript gives type aliases an implicit index signature but not interfaces — an interface fails with a confusing variance error.
- `calculateMetadata` Zod-parses the manifest and returns width/height/fps/durationInFrames **from it**, so format and length are never hardcoded in the composition.
- The composition reads frame offsets, it never computes them. All timing came from `compileManifest`/`computeSceneTimeline` upstream.
- Captions render outside the scene `<Sequence>`s: their timings are in whole-timeline space and must not be re-based per scene. Lines are grouped at compile time and **split at scene boundaries** — a line spanning a cut holds the previous scene's words over the next scene's picture (seen and fixed in phase 7).
- Exactly one `<Audio>` (the mixed master). Never mount the individual voiceover clips.
- `GET /api/projects/:id/manifest` serves the `pathMode: "http"` manifest for the Player; the renderer (phase 8) compiles with `"fs"` instead.

## Render pipeline (`services/pipeline.ts`, `services/renderer.ts`)

`POST /api/projects/:id/render` enqueues one job that runs validate → tts → captions → mix → render, each step reusing its own content-hash cache, so a re-render after a small edit only redoes what that edit affected. `scoped()` maps each sub-step's 0–1 progress into a slice of the overall bar.

- **`force` applies to the render step only, never upstream.** Cascading it would re-synthesize every scene through a paid API when the audio is provably current — not what someone pressing "render again" is asking for. Regenerating voiceover/captions is an explicit action in the Audio tab.
- **No API-key pre-check in the pipeline.** A scene can look stale in `project.json` while its audio is already cached on disk; only the TTS service knows that, and it raises its own actionable error if it genuinely must call the API.
- **The renderer compiles with `pathMode: "http"` plus an absolute `baseUrl`**, not `fs`. Remotion serves the bundle from its own random localhost port, so relative `/files/...` would resolve against that port, and `file://` subresources are blocked from an `http://` page. Absolute paths into the API server are the thing that works.
- **Cancel needs `makeCancelSignal()`, not just checkpoints.** `renderMedia` runs for minutes in a single call; `ctx.onCancel(abort)` hands the job a way to interrupt it, otherwise the button appears to work while Chromium keeps going. Anything that aborts throws the library's own error, so the queue treats *any* error on a cancelled job as a cancellation.
- Bundling is cached in `.cache/bundle` and invalidated by the newest mtime under `packages/video/src`.
- `manifestHash(manifest)` is the render's identity: matching `lastRender.manifestHash` short-circuits, and it's the only way `deriveStatus` can reach `rendered`. `updateProject` takes it as an option because compiling a manifest on every autosave write would mean reading assets and captions on each keystroke — only the renderer passes it, and any later edit honestly drops back to `ready`.
- **`pathExists` is files-only** (`Bun.file(dir).exists()` is false for directories) — use `dirExists` for folders.

## Providers (`apps/server/src/providers/`)

All four capability interfaces live in `types.ts` (TTS implemented; Image/Video/Stock defined but unimplemented). Each carries `isConfigured(settings)` so the UI can ask whether a key is present without ever seeing it. Registered by `providerId` in `registry.ts` — adding a provider is a new file plus one registry line, never a change to `services/`.

`tts/elevenlabs.ts` is the reference implementation. Two things worth copying: it maps provider HTTP failures onto our own error codes with messages a user can act on (401 → "check the key in Settings", 429 → rate limit) instead of leaking a raw response into a 500; and note the endpoints straddle versions — synthesis is `/v1/text-to-speech/{voice_id}`, voice listing is `/v2/voices`. Not a typo.

## Verification

```bash
bun install && bun dev
```

`bun run typecheck` must be clean across all packages before every commit. Where `bun test` files exist (currently `packages/core/src/helpers/*.test.ts`), they must pass too.
