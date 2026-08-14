import { useState } from "react";
import { Check, CircleDashed, Film, Loader2, Play, X } from "lucide-react";
import { describeFormat, resolveFormat, type JobStep, type Project, type RenderJob } from "@app/core";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { useJobStream } from "@/hooks/useJob.ts";
import { api, ApiError, projectFileUrl } from "@/lib/api.ts";
import { formatBytes } from "@app/core";
import { formatRelativeTime } from "@/lib/format.ts";
import { ASPECT_OPTIONS, FPS_OPTIONS, RESOLUTION_OPTIONS } from "@/lib/video-format.ts";
import { cn } from "@/lib/utils.ts";

function OutputFormatSection({
  project,
  onUpdate,
  disabled,
}: {
  project: Project;
  onUpdate: (patch: Partial<Pick<Project, "format">>) => void;
  disabled: boolean;
}) {
  // A hand-edited project.json can hold dimensions that don't match any
  // (aspect, resolution) combo. Rather than crash, fall back to a sensible
  // default — picking it here just resets the pickers, it doesn't touch
  // project.format until the user actually changes a value.
  const current = describeFormat(project.format) ?? { aspect: "shorts" as const, resolution: "1080p" as const, fps: 30 as const };

  function apply(patch: Partial<typeof current>) {
    const next = { ...current, ...patch };
    onUpdate({ format: resolveFormat(next.aspect, next.resolution, next.fps) });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Output format</Label>
        <span className="text-muted-foreground text-xs tabular-nums">
          {project.format.width}×{project.format.height} · {project.format.fps}fps
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          value={current.aspect}
          disabled={disabled}
          onValueChange={(v) => apply({ aspect: v as typeof current.aspect })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ASPECT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label} ({opt.aspect})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={current.resolution}
          disabled={disabled}
          onValueChange={(v) => apply({ resolution: v as typeof current.resolution })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESOLUTION_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={String(current.fps)}
          disabled={disabled}
          onValueChange={(v) => apply({ fps: Number(v) as typeof current.fps })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FPS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={String(opt.value)}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-muted-foreground text-xs">
        Changing this makes the current video out of date — the next render picks it up.
      </p>
    </div>
  );
}

// The pipeline in the order the job runs it, so the checklist reads as
// progress rather than as a legend.
const STEPS: { id: JobStep; label: string }[] = [
  { id: "validate", label: "Check the project" },
  { id: "tts", label: "Generate voiceover" },
  { id: "captions", label: "Transcribe captions" },
  { id: "mix", label: "Mix audio" },
  { id: "render", label: "Render video" },
];

function StepRow({ step, job }: { step: (typeof STEPS)[number]; job: RenderJob | null }) {
  const currentIndex = job?.step ? STEPS.findIndex((s) => s.id === job.step) : -1;
  const myIndex = STEPS.findIndex((s) => s.id === step.id);
  const done = job?.state === "done" || (currentIndex > myIndex && currentIndex !== -1);
  const active = job?.step === step.id && job.state === "running";
  const failed = job?.state === "error" && job.step === step.id;

  return (
    <div className="flex items-center gap-2 text-sm">
      {failed ? (
        <X className="text-destructive h-4 w-4" />
      ) : done ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : active ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <CircleDashed className="text-muted-foreground/40 h-4 w-4" />
      )}
      <span className={cn(active ? "" : done ? "text-muted-foreground" : "text-muted-foreground/60")}>
        {step.label}
      </span>
    </div>
  );
}

export function RenderTab({
  project,
  onUpdate,
  onJobFinished,
}: {
  project: Project;
  onUpdate: (patch: Partial<Pick<Project, "format">>) => void;
  onJobFinished: () => void;
}) {
  const [starting, setStarting] = useState(false);

  const renders = useQuery({
    queryKey: ["projects", project.id, "renders", project.updatedAt],
    queryFn: () => api.listRenders(project.id),
  });

  const { job, watch, isRunning } = useJobStream(project.id, (finished: RenderJob) => {
    if (finished.state === "done") toast.success("Video ready");
    if (finished.state === "error") toast.error(finished.error ?? "Render failed");
    if (finished.state === "cancelled") toast.info("Render cancelled");
    void renders.refetch();
    onJobFinished();
  });

  const hasScript = project.scenes.some((s) => s.text.trim().length > 0);
  const upToDate = renders.data?.upToDate ?? false;

  async function start(force: boolean) {
    setStarting(true);
    try {
      const started = await api.startRender(project.id, force ? { force: true } : {});
      watch(started.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't start the render");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <OutputFormatSection project={project} onUpdate={onUpdate} disabled={isRunning || starting} />

      <Separator />

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" disabled={!hasScript || isRunning || starting} onClick={() => void start(false)}>
          {isRunning || starting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Film className="h-4 w-4" />
          )}
          {isRunning ? "Rendering…" : upToDate ? "Video is up to date" : "Render video"}
        </Button>

        {upToDate && !isRunning && (
          <Button variant="outline" onClick={() => void start(true)} disabled={starting}>
            Render again anyway
          </Button>
        )}

        {isRunning && job && (
          <Button variant="ghost" onClick={() => void api.cancelJob(job.id)}>
            Cancel
          </Button>
        )}
      </div>

      {!hasScript && (
        <p className="text-muted-foreground text-sm">Write some narration in the Script tab first.</p>
      )}

      <p className="text-muted-foreground text-xs">
        Every step is cached — a re-render after a small edit only redoes the work that edit affected.
      </p>

      <Separator />

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-muted-foreground text-xs">Pipeline</Label>
          {STEPS.map((step) => (
            <StepRow key={step.id} step={step} job={job} />
          ))}
        </div>

        <div className="space-y-2">
          {job && (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="capitalize">{job.state}</span>
                <span className="text-muted-foreground tabular-nums">
                  {Math.round(job.progress * 100)}%
                </span>
              </div>
              <Progress value={job.progress * 100} />
              {job.error && <p className="text-destructive text-xs">{job.error}</p>}
              {job.log.length > 0 && (
                <ScrollArea className="h-40 rounded-md border">
                  <pre className="text-muted-foreground p-2 font-mono text-[11px] whitespace-pre-wrap">
                    {job.log.join("\n")}
                  </pre>
                </ScrollArea>
              )}
            </>
          )}
        </div>
      </div>

      {(renders.data?.renders.length ?? 0) > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <Label>Output history</Label>
            {renders.data?.renders.map((render) => (
              <div key={render.path} className="space-y-2 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Play className="text-muted-foreground h-3 w-3" />
                  <span className="font-mono text-xs">{render.filename}</span>
                  {render.isLatest && (
                    <Badge variant="secondary" className="text-[10px]">
                      latest
                    </Badge>
                  )}
                  <span className="text-muted-foreground ml-auto text-xs">
                    {formatBytes(render.bytes)} · {formatRelativeTime(render.createdAt)}
                  </span>
                </div>
                <video
                  controls
                  preload="none"
                  className="max-h-[420px] w-full rounded bg-black"
                  src={projectFileUrl(project.slug, render.path)}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
