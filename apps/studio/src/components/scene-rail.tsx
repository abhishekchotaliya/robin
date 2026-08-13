import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { moveScene, type Project, type Scene } from "@app/core";
import { Button } from "@/components/ui/button.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
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
import { SceneCard } from "@/components/scene-card.tsx";

export function SceneRail({
  project,
  selectedSceneId,
  onSelect,
  onReorder,
  onAddScene,
  onDeleteScene,
}: {
  project: Project;
  selectedSceneId: string | null;
  onSelect: (sceneId: string) => void;
  onReorder: (scenes: Scene[]) => void;
  onAddScene: () => void;
  onDeleteScene: (sceneId: string) => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<Scene | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    onReorder(moveScene(project.scenes, String(active.id), String(over.id)));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Scenes</h2>
        <span className="text-muted-foreground/60 text-xs tabular-nums">{project.scenes.length}</span>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1.5 px-3 pb-3">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={project.scenes.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {project.scenes.map((scene, index) => (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  index={index}
                  voice={project.voice}
                  selected={scene.id === selectedSceneId}
                  onSelect={() => onSelect(scene.id)}
                  onDelete={() => setPendingDelete(scene)}
                  canDelete={project.scenes.length > 1}
                />
              ))}
            </SortableContext>
          </DndContext>

          <Button variant="ghost" className="text-muted-foreground w-full justify-start" onClick={onAddScene}>
            <Plus className="h-4 w-4" />
            Add scene
          </Button>
        </div>
      </ScrollArea>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete scene {pendingDelete ? project.scenes.findIndex((s) => s.id === pendingDelete.id) + 1 : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Its narration and media assignment are removed. Generated voiceover files stay on disk.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) onDeleteScene(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
