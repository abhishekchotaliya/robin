import { useEffect, useRef, useState } from "react";
import type { ProjectListItem } from "@app/core";
import { Link } from "react-router-dom";
import { MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
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
import { StatusBadge } from "@/components/status-badge.tsx";
import { useDeleteProject, useDuplicateProject, useUpdateProject } from "@/hooks/useProjects.ts";
import { formatDuration, formatRelativeTime } from "@/lib/format.ts";
import { ApiError } from "@/lib/api.ts";

export function ProjectCard({ project }: { project: ProjectListItem }) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(project.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const updateProject = useUpdateProject(project.id);
  const deleteProject = useDeleteProject();
  const duplicateProject = useDuplicateProject();

  // Radix returns focus to the dropdown trigger when the menu closes, which
  // races the Input's autoFocus and wins — the trigger ends up focused
  // instead of the input. Focusing here, after that settles, wins the race.
  useEffect(() => {
    if (renaming) {
      const frame = requestAnimationFrame(() => renameInputRef.current?.select());
      return () => cancelAnimationFrame(frame);
    }
  }, [renaming]);

  async function commitRename() {
    const trimmed = title.trim();
    setRenaming(false);
    if (trimmed.length === 0 || trimmed === project.title) {
      setTitle(project.title);
      return;
    }
    try {
      await updateProject.mutateAsync({ title: trimmed });
    } catch (err) {
      setTitle(project.title);
      toast.error(err instanceof ApiError ? err.message : "Failed to rename project");
    }
  }

  async function confirmAndDelete() {
    try {
      await deleteProject.mutateAsync(project.id);
      toast.success(`Deleted "${project.title}"`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to delete project");
    } finally {
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <Card className="group relative overflow-hidden py-0">
        <Link to={`/projects/${project.id}`} className="block">
          <div className="bg-muted flex aspect-9/16 items-center justify-center overflow-hidden">
            {project.thumbnailUrl ? (
              <img src={project.thumbnailUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-muted-foreground px-4 text-center text-2xl font-semibold">
                {project.title
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join("")
                  .toUpperCase()}
              </span>
            )}
          </div>
        </Link>

        <div className="space-y-2 p-3">
          {renaming ? (
            <Input
              ref={renameInputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setTitle(project.title);
                  setRenaming(false);
                }
              }}
              className="h-7"
            />
          ) : (
            <Link to={`/projects/${project.id}`} className="line-clamp-1 text-sm font-medium hover:underline">
              {project.title}
            </Link>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusBadge status={project.status} />
              <span className="text-muted-foreground text-xs">
                {project.sceneCount} scene{project.sceneCount === 1 ? "" : "s"} ·{" "}
                {formatDuration(project.estimatedDurationMs)}
              </span>
            </div>
          </div>
          <p className="text-muted-foreground text-xs">Updated {formatRelativeTime(project.updatedAt)}</p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
              onClick={(e) => e.preventDefault()}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(e) => {
              // Without this, Radix returns focus to the trigger button on
              // close, which races (and beats) the rename input's own
              // focus below — the input flashes selected then blurs itself.
              e.preventDefault();
            }}
          >
            <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={async () => {
                try {
                  const copy = await duplicateProject.mutateAsync(project.id);
                  toast.success(`Duplicated as "${copy.title}"`);
                } catch (err) {
                  toast.error(err instanceof ApiError ? err.message : "Couldn't duplicate");
                }
              }}
            >
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Card>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{project.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The folder and all renders are removed from disk. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmAndDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
