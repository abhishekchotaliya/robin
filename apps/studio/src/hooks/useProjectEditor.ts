import { useCallback, useEffect, useRef, useState } from "react";
import {
  createEmptyScene,
  reindexScenes,
  type Project,
  type Scene,
  type UpdateProjectRequest,
} from "@app/core";
import { useProject, useUpdateProject } from "@/hooks/useProjects.ts";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 800;

/**
 * Autosave editor for one project. No Save button anywhere in the app.
 *
 * Local `draft` is authoritative once loaded — it is NOT re-hydrated on every
 * server response, because our own PATCH responses land continuously while
 * the user is still typing and would clobber in-flight keystrokes. It
 * re-hydrates only when the project id changes (mount / navigation).
 */
export function useProjectEditor(projectId: string) {
  const { data: serverProject, isLoading, isError, error } = useProject(projectId);
  const updateProject = useUpdateProject(projectId);

  const [draft, setDraft] = useState<Project | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const pendingRef = useRef<UpdateProjectRequest>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (serverProject && serverProject.id !== draft?.id) setDraft(serverProject);
  }, [serverProject, draft?.id]);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const patch = pendingRef.current;
    if (Object.keys(patch).length === 0) return;

    pendingRef.current = {};
    setStatus("saving");
    try {
      await updateProject.mutateAsync(patch);
      setStatus("saved");
    } catch {
      // Put the failed patch back so the next flush retries it instead of
      // dropping the user's edit. Anything typed since wins on conflict.
      pendingRef.current = { ...patch, ...pendingRef.current };
      setStatus("error");
    }
  }, [updateProject]);

  // Keep a stable handle for the unmount flush, which must not capture a
  // stale `flush` closure or it will save an out-of-date patch.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    return () => {
      void flushRef.current();
    };
  }, []);

  // Cmd+S forces an immediate save rather than opening the browser's save
  // dialog — people press it reflexively even in autosaving apps.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flushRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const update = useCallback(
    (patch: UpdateProjectRequest) => {
      setDraft((current) => (current ? { ...current, ...patch } : current));
      pendingRef.current = { ...pendingRef.current, ...patch };
      setStatus("saving");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flushRef.current(), DEBOUNCE_MS);
    },
    [],
  );

  const setScenes = useCallback(
    (next: Scene[]) => {
      update({ scenes: reindexScenes(next) });
    },
    [update],
  );

  const updateScene = useCallback(
    (sceneId: string, patch: Partial<Scene>) => {
      if (!draft) return;
      setScenes(draft.scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)));
    },
    [draft, setScenes],
  );

  const addScene = useCallback(
    (afterIndex?: number): Scene | null => {
      if (!draft) return null;
      const scene = createEmptyScene(draft.scenes.length);
      const next = [...draft.scenes];
      next.splice(afterIndex === undefined ? next.length : afterIndex + 1, 0, scene);
      setScenes(next);
      return scene;
    },
    [draft, setScenes],
  );

  const deleteScene = useCallback(
    (sceneId: string) => {
      if (!draft) return;
      setScenes(draft.scenes.filter((s) => s.id !== sceneId));
    },
    [draft, setScenes],
  );

  return {
    project: draft,
    isLoading,
    isError,
    error,
    status,
    flush,
    update,
    setScenes,
    updateScene,
    addScene,
    deleteScene,
  };
}
