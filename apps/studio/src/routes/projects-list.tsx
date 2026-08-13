import { useEffect, useState } from "react";
import { Film } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ThemeToggle } from "@/components/theme-toggle.tsx";
import { NewProjectDialog } from "@/components/new-project-dialog.tsx";
import { ProjectCard } from "@/components/project-card.tsx";
import { useProjects } from "@/hooks/useProjects.ts";
import { ApiError } from "@/lib/api.ts";

function CardSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="aspect-9/16 w-full rounded-lg" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-1/3" />
    </div>
  );
}

export function ProjectsListPage() {
  const { data: projects, isLoading, isError, error, refetch } = useProjects();
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setNewProjectOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-border/50 sticky top-0 z-10 flex items-center justify-between border-b bg-background/80 px-6 py-4 backdrop-blur">
        <h1 className="text-lg font-semibold">Faceless Video Studio</h1>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button onClick={() => setNewProjectOpen(true)}>New Project</Button>
        </div>
      </header>

      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />

      <main className="p-6">
        {isLoading && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <p className="text-destructive text-sm">
              {error instanceof ApiError ? error.message : "Failed to load projects."}
            </p>
            <Button variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !isError && projects && projects.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <Film className="text-muted-foreground h-10 w-10" />
            <p className="text-muted-foreground text-sm">No projects yet. Create one and paste your script.</p>
            <Button onClick={() => setNewProjectOpen(true)}>New Project</Button>
          </div>
        )}

        {!isLoading && !isError && projects && projects.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
