import { useState } from "react";
import { Loader2, Mic, SplitSquareVertical } from "lucide-react";
import { toast } from "sonner";
import {
  countWords,
  createEmptyScene,
  estimateSceneDurationMs,
  isSceneAudioStale,
  splitTextIntoScenes,
  type Project,
  type Scene,
} from "@app/core";
import { api, ApiError } from "@/lib/api.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { formatDuration } from "@/lib/format.ts";

export function ScriptTab({
  project,
  scene,
  onUpdateScene,
  onSetScenes,
  onSelectScene,
  onFlush,
  onJobStarted,
}: {
  project: Project;
  scene: Scene;
  onUpdateScene: (sceneId: string, patch: Partial<Scene>) => void;
  onSetScenes: (scenes: Scene[]) => void;
  onSelectScene: (sceneId: string) => void;
  onFlush: () => void;
  onJobStarted: (jobId: string) => void;
}) {
  const [confirmSplit, setConfirmSplit] = useState(false);
  const [generating, setGenerating] = useState(false);
  const stale = isSceneAudioStale(scene, project.voice);

  const blocks = splitTextIntoScenes(scene.text);
  const canSplit = blocks.length > 1;
  const words = countWords(scene.text);
  const estimateMs = estimateSceneDurationMs(scene.text);

  // Replaces this one scene with one scene per blank-line-separated block,
  // in place, keeping everything around it untouched.
  function applySplit() {
    const index = project.scenes.findIndex((s) => s.id === scene.id);
    if (index === -1) return;
    const created = blocks.map((text, i) => (i === 0 ? { ...scene, text } : createEmptyScene(0, text)));
    const next = [...project.scenes];
    next.splice(index, 1, ...created);
    onSetScenes(next);
    setConfirmSplit(false);
    const first = created[0];
    if (first) onSelectScene(first.id);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <div className="flex items-end justify-between">
          <Label htmlFor="narration">Narration</Label>
          <span className="text-muted-foreground text-xs tabular-nums">
            {words} word{words === 1 ? "" : "s"} · {formatDuration(estimateMs)}
            {scene.audio ? "" : " est."}
          </span>
        </div>
        {/* shadcn's Textarea carries `field-sizing-content`, so it grows to fit
            its content on its own — don't add manual scrollHeight sizing. */}
        <Textarea
          id="narration"
          value={scene.text}
          placeholder="What the voice says in this scene. Paste a whole script and use Split into scenes below."
          onChange={(e) => onUpdateScene(scene.id, { text: e.target.value })}
          onBlur={onFlush}
          className="min-h-40 resize-none"
        />
        <p className="text-muted-foreground text-xs">
          Scene length follows the voiceover — there's no duration to set.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="overlay">On-screen title (optional)</Label>
        <Input
          id="overlay"
          value={scene.overlayText ?? ""}
          placeholder="Shown on the video — not narrated"
          onChange={(e) => onUpdateScene(scene.id, { overlayText: e.target.value || null })}
          onBlur={onFlush}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={scene.text.trim().length === 0 || generating}
          onClick={async () => {
            setGenerating(true);
            try {
              const job = await api.generateTts(project.id, { sceneIds: [scene.id], force: true });
              onJobStarted(job.id);
            } catch (err) {
              toast.error(err instanceof ApiError ? err.message : "Couldn't start voiceover");
            } finally {
              setGenerating(false);
            }
          }}
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
          {stale ? "Generate voiceover" : "Regenerate voiceover"}
        </Button>

        {canSplit ? (
          <Button variant="outline" size="sm" onClick={() => setConfirmSplit(true)}>
            <SplitSquareVertical className="h-4 w-4" />
            Split into {blocks.length} scenes
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button variant="outline" size="sm" disabled>
                  <SplitSquareVertical className="h-4 w-4" />
                  Split into scenes
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Separate blocks with a blank line to split them into scenes.</TooltipContent>
          </Tooltip>
        )}
      </div>

      <AlertDialog open={confirmSplit} onOpenChange={setConfirmSplit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Split into {blocks.length} scenes?</AlertDialogTitle>
            <AlertDialogDescription>
              This scene's text is separated into {blocks.length} blocks by blank lines. Each becomes its own
              scene, in order.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={applySplit}>Split</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
