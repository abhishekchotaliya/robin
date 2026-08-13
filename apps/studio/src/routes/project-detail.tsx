import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { StatusBadge } from "@/components/status-badge.tsx";
import { useProject } from "@/hooks/useProjects.ts";

// Stub for Phase 1 — Phase 2 replaces the body with the scene rail + script
// editor. This just proves routing and useProject() work end to end.
export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading, isError } = useProject(id ?? "");

  return (
    <div className="min-h-screen">
      <header className="border-border/50 flex items-center gap-3 border-b px-6 py-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        {isLoading && <Skeleton className="h-6 w-48" />}
        {project && (
          <>
            <h1 className="text-lg font-semibold">{project.title}</h1>
            <StatusBadge status={project.status} />
          </>
        )}
      </header>
      <main className="p-6">
        {isError && <p className="text-destructive text-sm">Project not found.</p>}
        {project && (
          <p className="text-muted-foreground text-sm">
            {project.scenes.length} scene{project.scenes.length === 1 ? "" : "s"} · scene editor arrives in Phase 2.
          </p>
        )}
      </main>
    </div>
  );
}
