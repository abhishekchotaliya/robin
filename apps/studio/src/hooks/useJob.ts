import { useCallback, useEffect, useRef, useState } from "react";
import type { RenderJob } from "@app/core";
import { useQueryClient } from "@tanstack/react-query";
import { streamJob } from "@/lib/api.ts";

const TERMINAL = ["done", "error", "cancelled"];

/**
 * Watches a job over SSE (never polling — the server pushes each update).
 * Call `watch(jobId)` after starting a job; the stream closes itself when
 * the job reaches a terminal state, and on unmount.
 */
export function useJobStream(projectId: string, onFinished?: (job: RenderJob) => void) {
  const [job, setJob] = useState<RenderJob | null>(null);
  const closeRef = useRef<(() => void) | null>(null);
  const queryClient = useQueryClient();
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => () => closeRef.current?.(), []);

  const watch = useCallback(
    (jobId: string) => {
      closeRef.current?.();
      closeRef.current = streamJob(jobId, {
        onProgress: (next) => {
          setJob(next);
          if (TERMINAL.includes(next.state)) {
            // The job wrote scene.audio server-side, so the cached project
            // is now stale.
            queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
            onFinishedRef.current?.(next);
          }
        },
      });
    },
    [projectId, queryClient],
  );

  const isRunning = job !== null && !TERMINAL.includes(job.state);

  return { job, watch, isRunning };
}
