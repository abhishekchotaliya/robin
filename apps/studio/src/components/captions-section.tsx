import { useState } from "react";
import { Captions, Loader2 } from "lucide-react";
import { captionsHash, scenesNeedingAudio, type Project, type RenderJob } from "@app/core";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Slider } from "@/components/ui/slider.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { useCaptions } from "@/hooks/useCaptions.ts";
import { useJobStream } from "@/hooks/useJob.ts";
import { api, ApiError } from "@/lib/api.ts";

export function CaptionsSection({
  project,
  onUpdate,
}: {
  project: Project;
  onUpdate: (patch: { captions: Project["captions"] }) => void;
}) {
  const { data: captions, refetch } = useCaptions(project.id);
  const [starting, setStarting] = useState(false);

  const { job, watch, isRunning } = useJobStream(project.id, (finished: RenderJob) => {
    if (finished.state === "done") {
      toast.success("Captions ready");
      void refetch();
    }
    if (finished.state === "error") toast.error(finished.error ?? "Captions failed");
  });

  const missingAudio = scenesNeedingAudio(project).length > 0 || project.scenes.every((s) => !s.audio);
  // Captions are transcribed from the voiceover, so they go stale exactly
  // when that audio changes — same hash the server checks.
  const stale = captions !== null && captions !== undefined && captions.hash !== captionsHash(project);

  async function generate(force: boolean) {
    setStarting(true);
    try {
      const started = await api.generateCaptions(project.id, force ? { force: true } : {});
      watch(started.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't start captions");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <Captions className="h-4 w-4" />
          Captions
        </Label>
        <Switch
          checked={project.captions.enabled}
          onCheckedChange={(enabled) => onUpdate({ captions: { ...project.captions, enabled } })}
        />
      </div>

      {project.captions.enabled && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="caption-style">Style</Label>
              <Select
                value={project.captions.style}
                onValueChange={(style) =>
                  onUpdate({
                    captions: { ...project.captions, style: style as Project["captions"]["style"] },
                  })
                }
              >
                <SelectTrigger id="caption-style">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bold-center">Bold, centered</SelectItem>
                  <SelectItem value="subtle-lower">Subtle, lower third</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Words per line</Label>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {project.captions.maxWordsPerLine}
                </span>
              </div>
              <Slider
                min={1}
                max={8}
                step={1}
                value={[project.captions.maxWordsPerLine]}
                onValueChange={([maxWordsPerLine]) =>
                  onUpdate({
                    captions: {
                      ...project.captions,
                      maxWordsPerLine: maxWordsPerLine ?? project.captions.maxWordsPerLine,
                    },
                  })
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={missingAudio || isRunning || starting}
              onClick={() => void generate(stale)}
            >
              {isRunning || starting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Captions className="h-4 w-4" />
              )}
              {captions ? (stale ? "Re-transcribe" : "Transcribe again") : "Transcribe voiceover"}
            </Button>
            {captions && !stale && (
              <Badge variant="secondary" className="text-[10px]">
                {captions.words.length} words · {captions.model}
              </Badge>
            )}
            {stale && (
              <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-400">
                Out of date — voiceover changed
              </Badge>
            )}
          </div>

          {missingAudio && (
            <p className="text-muted-foreground text-xs">
              Generate voiceover first — captions are transcribed from it, so the timings match the audio
              exactly.
            </p>
          )}

          {job && isRunning && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between text-xs">
                <span>{job.log[job.log.length - 1] ?? job.state}</span>
                <span className="text-muted-foreground tabular-nums">{Math.round(job.progress * 100)}%</span>
              </div>
              <Progress value={job.progress * 100} />
              <p className="text-muted-foreground text-[11px]">
                The first run downloads and compiles whisper.cpp — a few minutes. Later runs are seconds.
              </p>
            </div>
          )}

          {/* Debug view: the raw word timings the renderer will use. */}
          {captions && captions.words.length > 0 && (
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Word timings</Label>
              <ScrollArea className="h-40 rounded-md border">
                <div className="flex flex-wrap gap-1 p-2">
                  {captions.words.map((word, index) => (
                    <span
                      key={`${word.startMs}-${index}`}
                      className="bg-muted/60 rounded px-1.5 py-0.5 font-mono text-[11px]"
                      title={`${word.startMs}–${word.endMs}ms`}
                    >
                      {word.text}
                      <span className="text-muted-foreground/60 ml-1">
                        {(word.startMs / 1000).toFixed(2)}s
                      </span>
                    </span>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </>
      )}
    </div>
  );
}
