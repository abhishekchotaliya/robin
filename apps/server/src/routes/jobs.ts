import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { cancelJob, getJob, subscribe } from "../jobs/queue.ts";

const TERMINAL_STATES = new Set(["done", "error", "cancelled"]);

export const jobsRoutes = new Hono()
  .get("/:id", (c) => c.json(getJob(c.req.param("id"))))

  .post("/:id/cancel", (c) => {
    cancelJob(c.req.param("id"));
    return c.json(getJob(c.req.param("id")), 202);
  })

  .get("/:id/stream", (c) => {
    const id = c.req.param("id");
    getJob(id); // 404s before opening a stream for a job that doesn't exist

    return streamSSE(c, async (stream) => {
      let resolveDone: () => void;
      const done = new Promise<void>((resolve) => {
        resolveDone = resolve;
      });

      const unsubscribe = subscribe(id, (job) => {
        void stream.writeSSE({ data: JSON.stringify(job), event: "progress" });
        if (TERMINAL_STATES.has(job.state)) resolveDone();
      });

      // Send current state immediately so a client that connects after the
      // job already finished still gets an answer and closes cleanly.
      const current = getJob(id);
      await stream.writeSSE({ data: JSON.stringify(current), event: "progress" });
      if (TERMINAL_STATES.has(current.state)) resolveDone!();

      stream.onAbort(() => {
        unsubscribe();
        resolveDone();
      });

      await done;
      unsubscribe();
    });
  });
