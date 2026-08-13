import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Image, Mic, Trash2 } from "lucide-react";
import { estimateSceneDurationMs, sceneAudioHash, type Project, type Scene } from "@app/core";
import { Button } from "@/components/ui/button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { cn } from "@/lib/utils.ts";
import { formatDuration } from "@/lib/format.ts";

const PREVIEW_WORDS = 8;

function previewText(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Empty scene";
  const preview = words.slice(0, PREVIEW_WORDS).join(" ");
  return words.length > PREVIEW_WORDS ? `${preview}…` : preview;
}

// 🎙 missing / stale / fresh, 🖼 assigned or not — the two things that decide
// whether this scene can render, visible without opening it.
function audioState(scene: Scene, voice: Project["voice"]): "missing" | "stale" | "fresh" {
  if (!scene.audio) return "missing";
  return scene.audio.hash === sceneAudioHash(scene.text, voice) ? "fresh" : "stale";
}

const AUDIO_DOT_CLASS = {
  missing: "text-muted-foreground/40",
  stale: "text-amber-500",
  fresh: "text-green-500",
} as const;

const AUDIO_LABEL = {
  missing: "No voiceover yet",
  stale: "Voiceover is stale — script or voice changed since it was generated",
  fresh: "Voiceover up to date",
} as const;

export function SceneCard({
  scene,
  index,
  voice,
  selected,
  onSelect,
  onDelete,
  canDelete,
}: {
  scene: Scene;
  index: number;
  voice: Project["voice"];
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: scene.id,
  });

  const audio = audioState(scene, voice);
  const hasMedia = scene.media.kind !== "color" && scene.media.assetId !== null;
  const durationMs = scene.audio?.durationMs ?? estimateSceneDurationMs(scene.text);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group bg-card flex gap-2 rounded-md border p-2 text-left",
        selected ? "border-primary ring-primary/30 ring-1" : "border-border hover:border-border/80",
        isDragging && "z-10 opacity-80 shadow-lg",
      )}
    >
      <button
        type="button"
        className="text-muted-foreground/50 hover:text-muted-foreground cursor-grab touch-none active:cursor-grabbing"
        aria-label={`Reorder scene ${index + 1}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 gap-2 text-left">
        <div
          className="mt-0.5 h-10 w-6 shrink-0 rounded-sm border border-white/5"
          style={{ backgroundColor: scene.media.color }}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground text-xs tabular-nums">{index + 1}</span>
            <span className="text-muted-foreground/60 text-[10px]">{formatDuration(durationMs)}</span>
          </div>
          <p className={cn("line-clamp-2 text-xs", scene.text.trim() ? "" : "text-muted-foreground/50 italic")}>
            {previewText(scene.text)}
          </p>
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Mic className={cn("h-3 w-3", AUDIO_DOT_CLASS[audio])} />
              </TooltipTrigger>
              <TooltipContent>{AUDIO_LABEL[audio]}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Image
                  className={cn("h-3 w-3", hasMedia ? "text-green-500" : "text-muted-foreground/40")}
                />
              </TooltipTrigger>
              <TooltipContent>{hasMedia ? "Media assigned" : "No media — solid color"}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </button>

      {canDelete && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete scene ${index + 1}`}
          className="text-muted-foreground/50 hover:text-destructive h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
