import type { JobState, JobStep, RenderJob } from "@app/core";
import { NotFoundError } from "../lib/errors.ts";

/**
 * In-memory job queue: one job runs at a time, progress is pushed to
 * subscribers over SSE. Long operations are never a blocking request — the
 * client gets a jobId immediately and watches the stream.
 *
 * Phase 4 uses this for TTS; phase 8 runs the full render pipeline through
 * the same queue. Jobs are deliberately not persisted: a job that didn't
 * finish before a restart has no meaning, and its outputs are all
 * content-hash cached anyway, so re-running is cheap.
 */
export interface JobContext {
  setStep(step: JobStep): void;
  setProgress(progress: number): void;
  log(line: string): void;
  /** Throws if the job was cancelled, so a runner can bail between units of work. */
  throwIfCancelled(): void;
}

export class JobCancelledError extends Error {
  constructor() {
    super("job cancelled");
    this.name = "JobCancelledError";
  }
}

type Subscriber = (job: RenderJob) => void;

const jobs = new Map<string, RenderJob>();
const subscribers = new Map<string, Set<Subscriber>>();
const cancelled = new Set<string>();

let queue: Promise<unknown> = Promise.resolve();

function emit(job: RenderJob): void {
  for (const notify of subscribers.get(job.id) ?? []) notify(job);
}

function update(id: string, patch: Partial<RenderJob>): void {
  const current = jobs.get(id);
  if (!current) return;
  const next = { ...current, ...patch };
  jobs.set(id, next);
  emit(next);
}

export function getJob(id: string): RenderJob {
  const job = jobs.get(id);
  if (!job) throw new NotFoundError(`job ${id} not found`);
  return job;
}

export function subscribe(id: string, notify: Subscriber): () => void {
  const set = subscribers.get(id) ?? new Set<Subscriber>();
  set.add(notify);
  subscribers.set(id, set);
  return () => {
    set.delete(notify);
    if (set.size === 0) subscribers.delete(id);
  };
}

export function cancelJob(id: string): void {
  const job = getJob(id);
  if (job.state === "done" || job.state === "error" || job.state === "cancelled") return;
  cancelled.add(id);
  // A queued job never starts; a running one stops at its next checkpoint.
  if (job.state === "queued") {
    update(id, { state: "cancelled", finishedAt: new Date().toISOString() });
  }
}

export function enqueueJob(
  projectId: string,
  run: (ctx: JobContext) => Promise<string | null>,
): RenderJob {
  const id = crypto.randomUUID();
  const job: RenderJob = {
    id,
    projectId,
    state: "queued",
    step: null,
    progress: 0,
    log: [],
    outputPath: null,
    error: null,
    startedAt: null,
    finishedAt: null,
  };
  jobs.set(id, job);

  const ctx: JobContext = {
    setStep: (step) => update(id, { step }),
    setProgress: (progress) => update(id, { progress: Math.max(0, Math.min(1, progress)) }),
    log: (line) => {
      const current = jobs.get(id);
      if (current) update(id, { log: [...current.log, line] });
    },
    throwIfCancelled: () => {
      if (cancelled.has(id)) throw new JobCancelledError();
    },
  };

  // Chain onto the queue so only one job runs at a time. `.catch` on the
  // stored tail keeps one failure from stalling everything behind it.
  queue = queue.then(async () => {
    if (cancelled.has(id)) return;
    update(id, { state: "running", startedAt: new Date().toISOString() });
    try {
      const outputPath = await run(ctx);
      const finalState: JobState = cancelled.has(id) ? "cancelled" : "done";
      update(id, {
        state: finalState,
        progress: finalState === "done" ? 1 : jobs.get(id)?.progress ?? 0,
        outputPath,
        finishedAt: new Date().toISOString(),
      });
    } catch (err) {
      if (err instanceof JobCancelledError) {
        update(id, { state: "cancelled", finishedAt: new Date().toISOString() });
      } else {
        console.error(`[jobs] job ${id} failed:`, err);
        update(id, {
          state: "error",
          error: err instanceof Error ? err.message : "unknown error",
          finishedAt: new Date().toISOString(),
        });
      }
    } finally {
      cancelled.delete(id);
    }
  });

  return job;
}
