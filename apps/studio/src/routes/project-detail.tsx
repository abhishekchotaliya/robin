import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Film } from "lucide-react";
import { estimateSceneDurationMs } from "@app/core";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable.tsx";
import { StatusBadge } from "@/components/status-badge.tsx";
import { SaveIndicator } from "@/components/save-indicator.tsx";
import { SceneRail } from "@/components/scene-rail.tsx";
import { ScriptTab } from "@/components/script-tab.tsx";
import { MediaTab } from "@/components/media-tab.tsx";
import { AudioTab } from "@/components/audio-tab.tsx";
import { PreviewTab } from "@/components/preview-tab.tsx";
import { useAssets } from "@/hooks/useAssets.ts";
import { useJobStream } from "@/hooks/useJob.ts";
import { ComingSoon } from "@/components/coming-soon.tsx";
import { useProjectEditor } from "@/hooks/useProjectEditor.ts";
import { useUIStore } from "@/stores/ui.ts";
import { formatDuration } from "@/lib/format.ts";

const TABS = ["script", "media", "audio", "preview", "render"] as const;

export function ProjectDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const editor = useProjectEditor(id);
  const { data: assets } = useAssets(id);
  const {
    project,
    status,
    flush,
    update,
    setScenes,
    updateScene,
    addScene,
    deleteScene,
    reloadFromServer,
  } = editor;

  // A TTS job writes scene.audio on the server, so pull the result back into
  // the draft when it lands — the draft never re-hydrates on its own.
  const { watch: watchJob } = useJobStream(id, () => void reloadFromServer());

  const selectedSceneId = useUIStore((s) => s.selectedSceneId);
  const setSelectedSceneId = useUIStore((s) => s.setSelectedSceneId);
  const [tab, setTab] = useState<(typeof TABS)[number]>("script");
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Keep a valid selection at all times: on load, and whenever the selected
  // scene disappears (deleted, or we navigated in from another project).
  const scenes = project?.scenes;
  useEffect(() => {
    if (!scenes || scenes.length === 0) return;
    if (!selectedSceneId || !scenes.some((s) => s.id === selectedSceneId)) {
      setSelectedSceneId(scenes[0]!.id);
    }
  }, [scenes, selectedSceneId, setSelectedSceneId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      const index = Number(e.key) - 1;
      const next = TABS[index];
      if (next) {
        e.preventDefault();
        setTab(next);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (editor.isLoading && !project) {
    return (
      <div className="flex h-screen flex-col">
        <header className="border-border/50 flex items-center gap-3 border-b px-4 py-3">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-6 w-48" />
        </header>
        <div className="flex flex-1 gap-4 p-4">
          <Skeleton className="h-full w-64" />
          <Skeleton className="h-full flex-1" />
        </div>
      </div>
    );
  }

  if (editor.isError || !project) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3">
        <p className="text-destructive text-sm">Project not found.</p>
        <Button variant="outline" asChild>
          <Link to="/">Back to projects</Link>
        </Button>
      </div>
    );
  }

  const selectedScene = project.scenes.find((s) => s.id === selectedSceneId) ?? project.scenes[0];
  const totalMs = project.scenes.reduce(
    (sum, s) => sum + (s.audio?.durationMs ?? estimateSceneDurationMs(s.text)),
    0,
  );

  function commitTitle() {
    const trimmed = (titleDraft ?? "").trim();
    setTitleDraft(null);
    if (trimmed.length > 0 && trimmed !== project?.title) update({ title: trimmed });
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="border-border/50 flex items-center gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="icon" asChild aria-label="Back to projects">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>

        {titleDraft === null ? (
          <button
            type="button"
            className="rounded px-1 text-lg font-semibold hover:bg-accent/50"
            onClick={() => {
              setTitleDraft(project.title);
              requestAnimationFrame(() => titleInputRef.current?.select());
            }}
          >
            {project.title}
          </button>
        ) : (
          <Input
            ref={titleInputRef}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setTitleDraft(null);
            }}
            className="h-8 max-w-xs text-lg font-semibold"
          />
        )}

        <StatusBadge status={project.status} />
        <span className="text-muted-foreground text-xs">
          {project.scenes.length} scene{project.scenes.length === 1 ? "" : "s"} · {formatDuration(totalMs)}
        </span>
        <div className="ml-auto">
          <SaveIndicator status={status} />
        </div>
      </header>

      {/* react-resizable-panels v4 renamed `direction` to `orientation`. */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1">
        {/* Sizes must be strings to mean percent — bare numbers are pixels in v4. */}
        <ResizablePanel defaultSize="22%" minSize="15%" maxSize="40%">
          <SceneRail
            project={project}
            assets={assets ?? []}
            selectedSceneId={selectedScene?.id ?? null}
            onSelect={setSelectedSceneId}
            onReorder={setScenes}
            onAddScene={() => {
              const scene = addScene();
              if (scene) setSelectedSceneId(scene.id);
            }}
            onDeleteScene={deleteScene}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize="78%">
          <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])} className="h-full gap-0">
            <TabsList className="mx-4 mt-3">
              <TabsTrigger value="script">Script</TabsTrigger>
              <TabsTrigger value="media">Media</TabsTrigger>
              <TabsTrigger value="audio">Audio</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="render">Render</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto">
              <TabsContent value="script">
                {selectedScene && (
                  <ScriptTab
                    project={project}
                    scene={selectedScene}
                    onUpdateScene={updateScene}
                    onSetScenes={setScenes}
                    onSelectScene={setSelectedSceneId}
                    onFlush={flush}
                    onJobStarted={watchJob}
                  />
                )}
              </TabsContent>
              <TabsContent value="media">
                {selectedScene && (
                  <MediaTab
                    project={project}
                    scene={selectedScene}
                    onUpdateScene={updateScene}
                    // The server clears scene references when an asset is
                    // deleted, but the local draft is authoritative and never
                    // re-hydrates mid-edit — so mirror that clear here or the
                    // editor keeps showing media that no longer exists.
                    onAssetDeleted={(assetId) =>
                      setScenes(
                        project.scenes.map((s) =>
                          s.media.assetId === assetId
                            ? { ...s, media: { ...s.media, assetId: null, kind: "color" as const } }
                            : s,
                        ),
                      )
                    }
                  />
                )}
              </TabsContent>
              <TabsContent value="audio">
                <AudioTab
                  project={project}
                  onUpdate={update}
                  onJobFinished={() => void reloadFromServer()}
                />
              </TabsContent>
              <TabsContent value="preview">
                <PreviewTab project={project} />
              </TabsContent>
              <TabsContent value="render">
                <ComingSoon
                  icon={Film}
                  title="Render"
                  description="One button, live progress, and an mp4 on disk when it finishes."
                  phase={8}
                />
              </TabsContent>
            </div>
          </Tabs>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
