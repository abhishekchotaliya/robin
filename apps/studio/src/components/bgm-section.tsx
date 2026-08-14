import { useState } from "react";
import { Loader2, Music, Waves } from "lucide-react";
import { mixHash, type Project, type RenderJob } from "@app/core";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Slider } from "@/components/ui/slider.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { useAssets } from "@/hooks/useAssets.ts";
import { useJobStream } from "@/hooks/useJob.ts";
import { api, ApiError, projectFileUrl } from "@/lib/api.ts";

const NO_BGM = "__none__";

export function BgmSection({
  project,
  onUpdate,
}: {
  project: Project;
  onUpdate: (patch: { bgm: Project["bgm"] }) => void;
}) {
  const { data: assets } = useAssets(project.id);
  const [starting, setStarting] = useState(false);

  const mixStatus = useQuery({
    queryKey: ["projects", project.id, "mix"],
    queryFn: () => api.getMixStatus(project.id),
  });

  const { job, watch, isRunning } = useJobStream(project.id, (finished: RenderJob) => {
    if (finished.state === "done") {
      toast.success("Master audio ready");
      void mixStatus.refetch();
    }
    if (finished.state === "error") toast.error(finished.error ?? "Mixing failed");
  });

  const musicTracks = (assets ?? []).filter((a) => a.kind === "audio");
  const hasVoiceover = project.scenes.some((s) => s.audio);
  // The server stamps the mix with this same hash; comparing here lets the
  // button say whether a rebuild would actually change anything.
  const stale = mixStatus.data?.exists === true && !mixStatus.data.upToDate;

  async function build(force: boolean) {
    setStarting(true);
    try {
      const started = await api.buildMix(project.id, force ? { force: true } : {});
      watch(started.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't start mixing");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Label className="flex items-center gap-2">
        <Music className="h-4 w-4" />
        Background music
      </Label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="bgm-track" className="text-muted-foreground text-xs">
            Track
          </Label>
          <Select
            value={project.bgm.assetId ?? NO_BGM}
            onValueChange={(value) =>
              onUpdate({ bgm: { ...project.bgm, assetId: value === NO_BGM ? null : value } })
            }
          >
            <SelectTrigger id="bgm-track">
              <SelectValue placeholder="No music" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_BGM}>No music</SelectItem>
              {musicTracks.map((asset) => (
                <SelectItem key={asset.id} value={asset.id}>
                  {asset.filename.replace(/^[0-9a-f]{8}-/, "")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {musicTracks.length === 0 && (
            <p className="text-muted-foreground text-xs">
              Upload an audio file in the Media tab to use it here.
            </p>
          )}
        </div>

        {project.bgm.assetId && (
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-muted-foreground text-xs">Music level</Label>
                <span className="text-muted-foreground text-xs tabular-nums">{project.bgm.gainDb} dB</span>
              </div>
              <Slider
                min={-40}
                max={0}
                step={1}
                value={[project.bgm.gainDb]}
                onValueChange={([gainDb]) =>
                  onUpdate({ bgm: { ...project.bgm, gainDb: gainDb ?? project.bgm.gainDb } })
                }
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-muted-foreground text-xs">Duck under speech</Label>
                <span className="text-muted-foreground text-xs tabular-nums">{project.bgm.duckingDb} dB</span>
              </div>
              <Slider
                min={-30}
                max={0}
                step={1}
                value={[project.bgm.duckingDb]}
                onValueChange={([duckingDb]) =>
                  onUpdate({ bgm: { ...project.bgm, duckingDb: duckingDb ?? project.bgm.duckingDb } })
                }
              />
            </div>
          </div>
        )}
      </div>

      {project.bgm.assetId && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-muted-foreground text-xs">Fade in</Label>
              <span className="text-muted-foreground text-xs tabular-nums">{project.bgm.fadeInMs} ms</span>
            </div>
            <Slider
              min={0}
              max={5000}
              step={100}
              value={[project.bgm.fadeInMs]}
              onValueChange={([fadeInMs]) =>
                onUpdate({ bgm: { ...project.bgm, fadeInMs: fadeInMs ?? project.bgm.fadeInMs } })
              }
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-muted-foreground text-xs">Fade out</Label>
              <span className="text-muted-foreground text-xs tabular-nums">{project.bgm.fadeOutMs} ms</span>
            </div>
            <Slider
              min={0}
              max={5000}
              step={100}
              value={[project.bgm.fadeOutMs]}
              onValueChange={([fadeOutMs]) =>
                onUpdate({ bgm: { ...project.bgm, fadeOutMs: fadeOutMs ?? project.bgm.fadeOutMs } })
              }
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!hasVoiceover || isRunning || starting}
          onClick={() => void build(stale)}
        >
          {isRunning || starting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Waves className="h-4 w-4" />
          )}
          {mixStatus.data?.exists ? "Rebuild master audio" : "Build master audio"}
        </Button>
        {mixStatus.data?.upToDate && (
          <Badge variant="secondary" className="text-[10px]">
            Up to date · -14 LUFS
          </Badge>
        )}
        {stale && (
          <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-400">
            Out of date
          </Badge>
        )}
      </div>

      {!hasVoiceover && (
        <p className="text-muted-foreground text-xs">Generate voiceover first — the mix is built around it.</p>
      )}

      {job && isRunning && (
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-center justify-between text-xs">
            <span>{job.log[job.log.length - 1] ?? job.state}</span>
            <span className="text-muted-foreground tabular-nums">{Math.round(job.progress * 100)}%</span>
          </div>
          <Progress value={job.progress * 100} />
        </div>
      )}

      {mixStatus.data?.exists && mixStatus.data.file && !isRunning && (
        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs">
            Master — voiceover, music and ducking as they'll be in the video
          </Label>
          {/* Cache-busted by the mix hash so a rebuild isn't served stale. */}
          <audio
            controls
            preload="none"
            className="h-9 w-full"
            src={`${projectFileUrl(project.slug, mixStatus.data.file)}?v=${mixHash(project)}`}
          />
        </div>
      )}
    </div>
  );
}
