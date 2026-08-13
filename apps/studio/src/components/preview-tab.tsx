import { useMemo, useRef } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { ShortsBasic } from "@app/video";
import type { Project } from "@app/core";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { api, ApiError } from "@/lib/api.ts";
import { formatDuration } from "@/lib/format.ts";

export function PreviewTab({ project }: { project: Project }) {
  const playerRef = useRef<PlayerRef>(null);

  // The manifest is compiled server-side and depends on scenes, assets,
  // captions and the master audio — so it's keyed on the project's
  // updatedAt to refetch whenever any of that changes.
  const {
    data: manifest,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["projects", project.id, "manifest", project.updatedAt],
    queryFn: () => api.getManifest(project.id),
  });

  const inputProps = useMemo(() => (manifest ? { manifest } : null), [manifest]);

  if (isLoading) {
    return (
      <div className="p-6">
        <Skeleton className="mx-auto aspect-9/16 w-full max-w-[300px] rounded-lg" />
      </div>
    );
  }

  if (error || !manifest || !inputProps) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <AlertCircle className="text-destructive h-8 w-8" />
        <p className="text-destructive text-sm">
          {error instanceof ApiError ? error.message : "Couldn't build a preview."}
        </p>
        <Button variant="outline" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const hasAudio = manifest.audioSrc !== null;
  const hasCaptions = manifest.captions.enabled && manifest.captions.lines.length > 0;

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="text-[10px]">
          {manifest.width}×{manifest.height} · {manifest.fps}fps
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          {formatDuration((manifest.durationInFrames / manifest.fps) * 1000)}
        </Badge>
        <Badge
          variant="outline"
          className={hasAudio ? "border-green-500/40 text-[10px] text-green-400" : "text-[10px]"}
        >
          {hasAudio ? "master audio" : "no audio yet"}
        </Badge>
        <Badge
          variant="outline"
          className={hasCaptions ? "border-green-500/40 text-[10px] text-green-400" : "text-[10px]"}
        >
          {hasCaptions ? `${manifest.captions.lines.length} caption lines` : "no captions"}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={isFetching ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
          Refresh
        </Button>
      </div>

      <div className="flex justify-center">
        <div className="bg-muted/30 w-full max-w-[320px] overflow-hidden rounded-lg border">
          <Player
            ref={playerRef}
            component={ShortsBasic}
            inputProps={inputProps}
            durationInFrames={Math.max(1, manifest.durationInFrames)}
            fps={manifest.fps}
            compositionWidth={manifest.width}
            compositionHeight={manifest.height}
            style={{ width: "100%" }}
            controls
            doubleClickToFullscreen
            acknowledgeRemotionLicense
          />
        </div>
      </div>

      <p className="text-muted-foreground text-center text-xs">
        The preview runs in the browser, so heavy effects can look slightly different from the final render —
        treat it as a layout check.
      </p>
    </div>
  );
}
